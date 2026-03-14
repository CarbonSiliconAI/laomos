import { EventEmitter } from 'events';
import { ExecutionEvent } from './types';

export interface EvolutionBusEvent {
    event_id: string;
    timestamp: string;
    source_type: 'flow_node' | 'agent' | 'skill';
    source_id: string;
    source_name: string;
    trigger: {
        error_type: string;
        error_message: string;
        exit_code: number | null;
        context: Record<string, unknown>;
    };
    intent: 'repair' | 'harden' | 'innovate';
    pcec_phases: {
        perceive_ms: number;
        construct_ms: number;
        evaluate_ms: number;
        commit_ms: number;
    };
    candidates: Array<{
        strategy: string;
        code_diff: string;
        sandbox_result: { passed: boolean; output: string; duration_ms: number };
        score: number;
    }>;
    selected: number | null;
    outcome: 'success' | 'failure' | 'fallback';
    cost_usd: number;
    latency_ms: number;
    gene_id: string | null;
}

class TelemetryBus extends EventEmitter {
    publish(event: ExecutionEvent): void {
        this.emit('execution_event', event);
    }

    subscribe(listener: (event: ExecutionEvent) => void): this {
        return this.on('execution_event', listener);
    }

    unsubscribe(listener: (event: ExecutionEvent) => void): this {
        return this.off('execution_event', listener);
    }

    publishEvolution(event: EvolutionBusEvent): void {
        this.emit('evolution_event', event);
    }

    subscribeEvolution(listener: (event: EvolutionBusEvent) => void): this {
        return this.on('evolution_event', listener);
    }

    unsubscribeEvolution(listener: (event: EvolutionBusEvent) => void): this {
        return this.off('evolution_event', listener);
    }
}

export const telemetryBus = new TelemetryBus();
