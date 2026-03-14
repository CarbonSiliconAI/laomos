import { ModelRouter } from './router';
import { SkillLoader } from './skill_loader';
import fs from 'fs-extra';
import path from 'path';

export interface TaskChainResult {
    nodes: Array<{ id: string; label: string; type: 'goal' | 'action'; success_condition?: string; skill?: string; function?: string }>;
    edges: Array<{ from: string; to: string }>;
}

export class TaskChainManager {
    private modelRouter: ModelRouter;
    private skillLoader: SkillLoader;

    constructor(modelRouter: ModelRouter, skillLoader: SkillLoader) {
        this.modelRouter = modelRouter;
        this.skillLoader = skillLoader;
    }

    /**
     * Decomposes a high-level goal into a graph of nodes and edges using an LLM.
     */
    async decomposeGoal(goal: string, preferredProvider: string = 'cloud'): Promise<TaskChainResult> {
        // Fetch installed skills for context
        const activeSkills = this.skillLoader.loadSkills();
        const skillList = activeSkills.map((s: any) => `- "${s.name}": ${s.description || 'No description'}`).join('\n');

        // Fetch Function Library Context
        let functionContext = '';
        const functionLibPath = path.join(process.cwd(), 'function_lib');
        try {
            if (await fs.pathExists(functionLibPath)) {
                const groups = await fs.readdir(functionLibPath);
                for (const group of groups) {
                    const groupPath = path.join(functionLibPath, group);
                    if ((await fs.stat(groupPath)).isDirectory()) {
                        const headPath = path.join(groupPath, 'HEAD.md');
                        if (await fs.pathExists(headPath)) {
                            const headContent = await fs.readFile(headPath, 'utf8');
                            functionContext += `\n--- Directory: ${group} ---\n${headContent}\n`;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[TaskChainDecomposer] Error reading function_lib:', err);
        }

        const systemPrompt = `You are a task decomposition engine. Given a high-level goal, break it down into smaller actionable steps using top-down reasoning. Start from the GOAL and work backwards to determine what actions must happen.

The user has the following skills/tools installed:
${skillList || '(none)'}

The user has the following Function Libraries available:
${functionContext || '(none)'}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "nodes": [
    { "id": "goal_1", "label": "The final goal", "type": "goal" },
    { "id": "act_1", "label": "A concrete action step", "type": "action", "success_condition": "How to verify this action succeeded", "skill": "skill-name", "function": "group_name/doc_name.ext" },
    { "id": "act_2", "label": "Another concrete action step", "type": "action", "success_condition": "How to verify this succeeded" }
  ],
  "edges": [
    { "from": "act_1", "to": "act_2" },
    { "from": "act_2", "to": "goal_1" }
  ]
}

Rules:
- There should be exactly ONE node with type "goal" (the final target).
- There are NO 'condition' nodes. Do NOT generate nodes with type "condition".
- "action" nodes are concrete steps the user needs to take.
- Every "action" node MUST have a "success_condition" string explaining exactly how to verify the action succeeded.
- Edges flow from prerequisites TO the things they enable (e.g. action_A → action_B → goal). 
- Use 3-6 total nodes for a reasonable decomposition. Do not over-decompose.
- IDs must be unique strings like goal_1, act_1, act_2, etc.
- Labels should be concise (under 60 characters).
- If an action node can be fulfilled by one of the installed skills, set the "skill" field to the exact skill name. Otherwise omit the "skill" field.
- If an action node closely matches the purpose of an available function document from the Function Libraries context, set "function" to the exact relative path "group_name/document_name.ext" (where group_name is the Directory the HEAD.md was found in). If no reasonable match exists, set "function": "none".
- Only assign skills or functions that genuinely match the action. Do not force assignments.`;

        const userPrompt = `Decompose this goal: "${goal}"`;

        const result = await this.modelRouter.routeChat(
            `${systemPrompt}\n\n${userPrompt}`,
            preferredProvider,
            'Task Chain Decomposer'
        );

        const responseText = result.response || '';

        // Extract JSON from the response
        let parsed: any;
        try {
            // Try direct parse first
            parsed = JSON.parse(responseText);
        } catch {
            // Try extracting JSON from markdown code blocks
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1].trim());
            } else {
                // Try finding raw JSON object
                const braceMatch = responseText.match(/\{[\s\S]*\}/);
                if (braceMatch) {
                    parsed = JSON.parse(braceMatch[0]);
                } else {
                    throw new Error('Could not extract JSON from LLM response');
                }
            }
        }

        if (!parsed.nodes || !parsed.edges) {
            throw new Error('Invalid decomposition structure: missing nodes or edges');
        }

        return parsed as TaskChainResult;
    }
}
