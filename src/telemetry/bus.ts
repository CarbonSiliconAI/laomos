import { EventEmitter } from 'events';
import { ExecutionEvent } from './types';

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
}

export const telemetryBus = new TelemetryBus();
