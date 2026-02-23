import { ExecutionRecord, ExecutionDiff, NodeDiff } from './types';

export function computeDiff(a: ExecutionRecord, b: ExecutionRecord): ExecutionDiff {
    const nodeDiffs: NodeDiff[] = [];
    const addedNodes: string[] = [];
    const removedNodes: string[] = [];

    const aEvents = new Map((a.events ?? a.steps ?? []).map(e => [e.node_id, e]));
    const bEvents = new Map((b.events ?? b.steps ?? []).map(e => [e.node_id, e]));
    const allNodeIds = new Set([...aEvents.keys(), ...bEvents.keys()]);

    for (const nodeId of allNodeIds) {
        const ae = aEvents.get(nodeId);
        const be = bEvents.get(nodeId);

        if (!ae) { addedNodes.push(nodeId); continue; }
        if (!be) { removedNodes.push(nodeId); continue; }

        const compareFields = ['latency_ms', 'cost_usd', 'input_tokens', 'output_tokens', 'model', 'status'] as const;
        for (const field of compareFields) {
            if (ae[field] !== be[field]) {
                nodeDiffs.push({ node_id: nodeId, field, value_a: ae[field], value_b: be[field] });
            }
        }
    }

    return {
        run_a: a.run_id,
        run_b: b.run_id,
        total_cost_delta: b.total_cost_usd - a.total_cost_usd,
        total_latency_delta: b.total_latency_ms - a.total_latency_ms,
        rating_delta: (b.rating != null && a.rating != null) ? b.rating - a.rating : undefined,
        node_diffs: nodeDiffs,
        added_nodes: addedNodes,
        removed_nodes: removedNodes,
    };
}
