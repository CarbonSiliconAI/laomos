import { ModelRouter } from './router';

export interface AnalyzedTask {
    target: string;
    expected_output: string;
    success_criteria: string;
    error?: string;
}

const ANALYZER_SYSTEM_PROMPT = `
You are the core Task Analyzer for an AI Operating System.
Your job is to read the user's raw prompt/request and break it down into a highly structured, goal-oriented execution plan.

You MUST respond with purely valid JSON. Do NOT wrap it in markdown code blocks.
The JSON must have the following exact structure:
{
  "target": "A clear, actionable sentence describing the primary goal of the task.",
  "expected_output": "What the concrete deliverable should be (e.g., 'A summary report', 'A python script', 'A list of files').",
  "success_criteria": "A concise sentence describing the exact condition that must be met to declare the task completed successfully."
}

Example User Prompt: "Write a newsletter about the latest AI trends."
Example JSON Response:
{
  "target": "Research and draft a newsletter focusing on recent trends in Artificial Intelligence.",
  "expected_output": "A formatted text document or markdown string containing the newsletter content.",
  "success_criteria": "The newsletter is written, covers at least 3 recent AI trends, and is ready for the user to review."
}
`.trim();

export class TaskAnalyzer {
    private modelRouter: ModelRouter;

    constructor(modelRouter: ModelRouter) {
        this.modelRouter = modelRouter;
    }

    /**
     * Analyzes a raw user prompt and returns a structured task breakdown.
     */
    async analyzeTask(prompt: string): Promise<AnalyzedTask> {
        try {
            // We prepend our system prompt to the user's request.
            // The router parses <Register_SystemPrompt> tags to extract system instructions.
            const query = `<Register_SystemPrompt>\n${ANALYZER_SYSTEM_PROMPT}\n</Register_SystemPrompt>\n\nUser Task: "${prompt}"`;

            // Route the prompt through the kernel's LLM router (defaulting to a capable cloud model if available, or fast local)
            // We use 'cloud-preferred' to ensure high quality JSON instruction following.
            const { response } = await this.modelRouter.routeChat(
                query,
                'cloud-preferred',
                'Kernel Task Analyzer'
            );

            // Clean up the response in case the LLM wrapped it in markdown
            let cleanedResponse = response.trim();
            if (cleanedResponse.startsWith('```json')) {
                cleanedResponse = cleanedResponse.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/^```/, '').replace(/```$/, '').trim();
            }

            const parsedData = JSON.parse(cleanedResponse);

            return {
                target: parsedData.target || 'Unknown target',
                expected_output: parsedData.expected_output || 'Unknown output',
                success_criteria: parsedData.success_criteria || 'Unknown criteria',
            };
        } catch (error: any) {
            console.error('[TaskAnalyzer] Failed to analyze task:', error);
            return {
                target: 'Error analyzing task',
                expected_output: 'None',
                success_criteria: 'None',
                error: error.message
            };
        }
    }
}
