import { EventEmitter } from 'events';

export interface DebugEvent {
    timestamp: number;
    type: 'input' | 'ingress' | 'egress' | 'tool_call' | 'tool_result' | 'system';
    source: string;
    message: string;
    payload?: any;
}

class DebugBus extends EventEmitter {
    publish(event: Omit<DebugEvent, 'timestamp'>): void {
        this.emit('debug_event', {
            ...event,
            timestamp: Date.now()
        });
    }

    subscribe(listener: (event: DebugEvent) => void): this {
        return this.on('debug_event', listener);
    }

    unsubscribe(listener: (event: DebugEvent) => void): this {
        return this.off('debug_event', listener);
    }
}

export const debugBus = new DebugBus();
