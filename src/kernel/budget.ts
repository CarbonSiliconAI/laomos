import { BudgetConstraint } from '../telemetry/types';

export function selectModel(
    accumulatedCostUsd: number,
    budget: BudgetConstraint
): string | undefined {
    // Over budget → force local (free) provider
    if (accumulatedCostUsd >= budget.maxCostUsdPerRun) return 'local';

    // Preferred provider explicitly set → use it
    const pref = budget.preferredModels[0];
    if (pref && ['local', 'openai', 'anthropic'].includes(pref)) return pref;

    // No preference → let ModelRouter auto-route by complexity
    return undefined;
}
