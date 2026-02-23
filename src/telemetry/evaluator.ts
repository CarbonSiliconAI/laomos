import { ExecutionRecord, Goal, OutcomeRecord } from './types';

export function computeOutcomeScore(record: ExecutionRecord, goal: Goal): OutcomeRecord {
    const scoresByDimension: Record<string, number> = {};
    const failReasons: string[] = [];

    let weightedSum = 0;
    let totalWeight = 0;

    for (const criteria of goal.success_criteria) {
        let score = 0;

        switch (criteria.dimension) {
            case 'task_completion':
                score = record.outcome === 'completed' ? 1.0 : 0.0;
                break;

            case 'cost_efficiency': {
                const actualCost = record.total_cost_usd ?? 0;
                score = Math.max(0, Math.min(1, 1 - actualCost / criteria.target));
                break;
            }

            case 'latency': {
                const actualMs = record.total_latency_ms ?? 0;
                score = Math.max(0, Math.min(1, 1 - actualMs / criteria.target));
                break;
            }

            case 'output_quality':
                if (criteria.evaluator === 'mock_llm_judge') {
                    const seed = parseInt(record.run_id.replace(/-/g, '').slice(0, 8), 16) || 42;
                    score = (seed % 30 + 70) / 100;
                } else {
                    // rule_based
                    score = record.outcome === 'completed' ? 0.8 : 0.2;
                }
                break;

            default:
                score = 0;
        }

        scoresByDimension[criteria.dimension] = score;
        weightedSum += score * criteria.weight;
        totalWeight += criteria.weight;

        if (score < criteria.floor) {
            failReasons.push(
                `${criteria.dimension} score ${score.toFixed(2)} below floor ${criteria.floor}`
            );
        }
    }

    const finalScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
    const passed = failReasons.length === 0;

    return {
        run_id: record.run_id,
        goal_id: goal.goal_id,
        scoresByDimension,
        finalScore,
        passed,
        failReasons,
    };
}
