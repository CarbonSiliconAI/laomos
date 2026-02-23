import crypto from 'crypto';

// Per-token costs in USD (2025 pricing)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    'gpt-4o':              { input: 0.0000025,  output: 0.00001 },
    'gpt-4o-mini':         { input: 0.00000015, output: 0.0000006 },
    'gpt-4-turbo':         { input: 0.00001,    output: 0.00003 },
    'gpt-3.5':             { input: 0.0000005,  output: 0.0000015 },
    'claude-3-5-sonnet':   { input: 0.000003,   output: 0.000015 },
    'claude-3-haiku':      { input: 0.00000025, output: 0.00000125 },
    'claude-3-opus':       { input: 0.000015,   output: 0.000075 },
    'gemini-2.0-flash':    { input: 0.0000001,  output: 0.0000004 },
    'gemini-1.5-pro':      { input: 0.00000125, output: 0.000005 },
    'dall-e-3':            { input: 0.04,       output: 0 }, // flat per image
    'local':               { input: 0,          output: 0 },
    'ollama':              { input: 0,          output: 0 },
    'mock':                { input: 0,          output: 0 },
};

export function estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
}

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
    const lowerModel = (model || '').toLowerCase();
    const key = Object.keys(MODEL_COSTS).find(k => lowerModel.includes(k));
    if (!key) return 0;
    const p = MODEL_COSTS[key];
    return p.input * inputTokens + p.output * outputTokens;
}

export function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}
