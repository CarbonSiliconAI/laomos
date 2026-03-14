import fs from 'fs-extra';
import path from 'path';
import { ModelRouter } from './router';
import { SkillLoader } from './skill_loader';
import { ToolRegistry } from './tool_registry';
import { TaskChainResult } from './task_chain_manager';
import { exec } from 'child_process';
import util from 'util';
import { debugBus } from '../telemetry/debug_bus';

const execPromise = util.promisify(exec);

export class TaskChainExecutor {
    private modelRouter: ModelRouter;
    private skillLoader: SkillLoader;
    private tools: ToolRegistry;

    constructor(modelRouter: ModelRouter, skillLoader: SkillLoader, tools: ToolRegistry) {
        this.modelRouter = modelRouter;
        this.skillLoader = skillLoader;
        this.tools = tools;
    }

    /**
     * Entry point to execute a full Task Chain Result.
     * Starts from leaf nodes and progresses to the goal.
     */
    async executeChain(chain: TaskChainResult, provider: string = 'cloud') {
        debugBus.publish({
            type: 'system',
            source: 'TaskChainExecutor',
            message: 'Starting Execution Pipeline',
            payload: { nodeCount: chain.nodes.length }
        });

        // 1. Topological Sort
        const sortedNodeIds = this.topologicalSort(chain);
        const nodeMap = new Map(chain.nodes.map(n => [n.id, n]));
        
        let accumulatedContext = '';

        // 2. Execute sequentially
        for (const nodeId of sortedNodeIds) {
            const node = nodeMap.get(nodeId);
            if (!node) continue;

            debugBus.publish({
                type: 'system',
                source: 'TaskChainExecutor',
                message: `Executing Step: ${node.label} (${node.id})`,
                payload: { type: node.type, function: node.function, skill: node.skill }
            });

            if (node.type === 'action') {
                const result = await this.executeActionWithRetry(node, accumulatedContext, provider);
                accumulatedContext += `\n--- Output from ${node.label} ---\n${result}\n`;
            } else if (node.type === 'goal') {
                await this.evaluateGoal(node, accumulatedContext, provider);
            }
        }

        debugBus.publish({
            type: 'system',
            source: 'TaskChainExecutor',
            message: 'Chain Execution Completed Successfully'
        });
    }

    /**
     * Resolves the dependency graph and returns an ordered array of Node IDs.
     * Leaf actions come first, Goal comes last.
     */
    private topologicalSort(chain: TaskChainResult): string[] {
        const inDegree = new Map<string, number>();
        const adjList = new Map<string, string[]>();

        // Initialize structures
        for (const node of chain.nodes) {
            inDegree.set(node.id, 0);
            adjList.set(node.id, []);
        }

        // Build Graph
        for (const edge of chain.edges) {
            const currentDeps = adjList.get(edge.from) || [];
            currentDeps.push(edge.to);
            adjList.set(edge.from, currentDeps);

            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        }

        // Find leaf nodes (inDegree === 0)
        const queue: string[] = [];
        for (const [nodeId, degree] of inDegree.entries()) {
            if (degree === 0) {
                queue.push(nodeId);
            }
        }

        const sorted: string[] = [];
        while (queue.length > 0) {
            const current = queue.shift()!;
            sorted.push(current);

            const neighbors = adjList.get(current) || [];
            for (const neighbor of neighbors) {
                inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            }
        }

        if (sorted.length !== chain.nodes.length) {
            throw new Error('Cycle detected in Task Chain dependency graph.');
        }

        return sorted;
    }

    /**
     * Central loop for executing an action, verifying success, and auto-debugging on failure.
     */
    private async executeActionWithRetry(
        node: NonNullable<TaskChainResult['nodes'][0]>,
        context: string,
        provider: string,
        maxRetries = 3
    ): Promise<string> {
        let currentAttempt = 0;
        let lastOutput = '';
        let lastError = '';

        // If a function or skill is linked, retrieve its instruction set
        let actionInstructions = `Execute the action: "${node.label}"`;
        if (node.function && node.function !== 'none') {
            try {
                const funcPath = path.join(process.cwd(), 'function_lib', node.function);
                if (await fs.pathExists(funcPath)) {
                    const funcContent = await fs.readFile(funcPath, 'utf8');
                    actionInstructions = `Execute the action "${node.label}" using the following reference document:\n\n${funcContent}\n\nIMPORTANT INSTRUCTION: If the reference document contains a relevant bash command block (e.g. \`\`\`bash ... \`\`\`), you MUST return that strict bash code directly. Do not over-explain. If you need tools to accomplish the task, use <tool_call>.`;
                }
            } catch (e) {
                console.warn(`[TaskChainExecutor] Failed to read function file: ${node.function}`);
            }
        }

        while (currentAttempt <= maxRetries) {
            try {
                // Determine Execution Prompt (includes debug history if retrying)
                let prompt = `You are a background executing agent.\nAction: ${node.label}\n\nContext:\n${context}\n\n${actionInstructions}\n\n${this.tools.exportToolsToXML()}`;
                if (currentAttempt > 0) {
                    debugBus.publish({
                        type: 'system',
                        source: 'AutoDebugger',
                        message: `Initiating Auto-Debug (Attempt ${currentAttempt}/${maxRetries}) for ${node.id}`,
                        payload: { error: lastError, failedOutput: lastOutput }
                    });
                    
                    prompt += `\n\n[URGENT BUG FIXING MODE]
Your previous attempt failed to satisfy the verification criteria: "${node.success_condition}".
Previous Output:
${lastOutput}

Failure Reason / Evaluator Notes:
${lastError}

Provide a corrected execution logic to achieve the success condition.`;
                }

                // Execute!
                let rawExecutionData = '';
                let hasToolCalls = true;
                let currentPrompt = prompt;
                let iterationCount = 0;

                while (hasToolCalls && iterationCount < 5) {
                    iterationCount++;
                    const result = await this.modelRouter.routeChat(currentPrompt, provider, 'Task Chain Executor');
                    const textOutput = result.response || '';
                    rawExecutionData += `\n${textOutput}`;

                    // Check for tool calls
                    const toolCallRegex = /<tool_call\s+name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
                    let match;
                    hasToolCalls = false;
                    let toolResultsChunk = '';

                    while ((match = toolCallRegex.exec(textOutput)) !== null) {
                        hasToolCalls = true;
                        const toolName = match[1];
                        const toolArgsStr = match[2].trim();

                        debugBus.publish({
                            type: 'tool_call',
                            source: 'TaskChainExecutor',
                            message: `Executing Tool: ${toolName}`,
                            payload: toolArgsStr
                        });

                        try {
                            const args = JSON.parse(toolArgsStr);
                            const tool = this.tools.getTool(toolName);
                            if (!tool) {
                                toolResultsChunk += `\n[Tool Result for ${toolName}]\nError: Tool not found.\n`;
                            } else {
                                const execRes = await tool.execute(args);
                                toolResultsChunk += `\n[Tool Result for ${toolName}]\n${JSON.stringify(execRes, null, 2)}\n`;
                            }
                        } catch (err: any) {
                            toolResultsChunk += `\n[Tool Result for ${toolName}]\nError: ${err.message}\n`;
                        }
                    }

                    if (hasToolCalls) {
                        currentPrompt += `\n\n${textOutput}\n\n${toolResultsChunk}\n\nPlease analyze the tool results and continue.`;
                        rawExecutionData += `\n${toolResultsChunk}`;
                    } else {
                        // If no tools were called, check if there's a bash snippet to run implicitly
                        const bashMatch = textOutput.match(/```bash\n([\s\S]*?)\n```/);
                        if (bashMatch) {
                            try {
                                const { stdout, stderr } = await execPromise(bashMatch[1]);
                                const terminalOutput = `\n\n--- Terminal Output ---\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
                                rawExecutionData += terminalOutput;
                            } catch (cmdErr: any) {
                                rawExecutionData += `\n\n--- Terminal Output ---\nCommand Halted with Error:\n${cmdErr.message}`;
                            }
                        }
                        lastOutput = textOutput;
                    }
                }

                // Verify Success
                const verificationResult = await this.evaluateSuccess(node, rawExecutionData, provider);

                if (verificationResult.passed) {
                    debugBus.publish({
                        type: 'system',
                        source: 'TaskChainExecutor',
                        message: `Action Verified: ${node.label} (${node.id})`,
                        payload: { output: rawExecutionData }
                    });
                    return rawExecutionData;
                } else {
                    lastOutput = rawExecutionData;
                    lastError = verificationResult.reason;
                    currentAttempt++;
                }

            } catch (err: any) {
                lastOutput = "Fatal system error during execution request.";
                lastError = err.message;
                currentAttempt++;
            }
        }

        throw new Error(`Auto-Debug failed for node ${node.id} after ${maxRetries} attempts.`);
    }

    /**
     * Evaluates if the raw output meets the `success_condition` parameter of the action node.
     */
    private async evaluateSuccess(node: any, rawExecutionData: string, provider: string): Promise<{ passed: boolean, reason: string }> {
        if (!node.success_condition) return { passed: true, reason: '' };

        const checkPrompt = `You are a strict QA evaluator.
Does the following execution output satisfy this success condition?
CONDITION: "${node.success_condition}"

OUTPUT TO EVALUATE:
---
${rawExecutionData}
---

Respond in this EXACT format:
Line 1: exactly "YES" or "NO"
Line 2: A one sentence explanation for your decision.`;

        const result = await this.modelRouter.routeChat(checkPrompt, provider, 'Execution Quality Validator');
        const text = result.response || '';
        
        const lines = text.split('\n');
        const firstLine = lines[0].toUpperCase().trim();
        const passed = firstLine.includes('YES');
        const reason = lines.slice(1).join('\n').trim();

        return { passed, reason };
    }

    /**
     * Evaluates the final goal using all accumulated context.
     */
    private async evaluateGoal(node: any, accumulatedContext: string, provider: string) {
        const checkPrompt = `You are the Goal Evaluator. Given all accumulated results from previous steps:\n---\n${accumulatedContext}\n---\nDoes it satisfy the primary overarching goal: "${node.label}"?\n\nRespond with "YES" or "NO" on the first line, followed by a comprehensive final answer summarizing the result.`;

        const result = await this.modelRouter.routeChat(checkPrompt, provider, 'Goal Validator');
        const text = result.response || '';
        const passed = text.split('\n')[0].toUpperCase().includes('YES');

        debugBus.publish({
            type: 'system',
            source: 'TaskChainExecutor',
            message: `Goal Evaluation: ${passed ? 'ACHIEVED' : 'FAILED'}`,
            payload: { output: text }
        });

        if (!passed) {
             throw new Error("Final Goal Verification Failed. Please review the intermediate output.");
        }
    }
}
