import fs from 'fs-extra';
import path from 'path';

export interface GameMessage {
    role: 'user' | 'system' | 'assistant';
    content: string;
}

export interface GameState {
    context: string;
    inventory: string;
    history: GameMessage[];
}

export class GameManager {
    private savePath: string;

    constructor() {
        // Find the root path (same approach as execution_journal or identity_manager)
        const root = process.env.APP_ROOT || process.cwd();
        this.savePath = path.join(root, 'storage', 'personal', 'game_save.json');

        // Ensure directory exists
        fs.ensureDirSync(path.dirname(this.savePath));
        if (!fs.existsSync(this.savePath)) {
            this.resetState();
        }
    }

    public getState(): GameState {
        try {
            const data = fs.readFileSync(this.savePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[GameManager] Error reading state:', error);
            return this.getEmptyState();
        }
    }

    public saveState(state: GameState) {
        try {
            fs.writeFileSync(this.savePath, JSON.stringify(state, null, 2), 'utf8');
        } catch (error) {
            console.error('[GameManager] Error writing state:', error);
        }
    }

    public resetState(): GameState {
        const empty = this.getEmptyState();
        this.saveState(empty);
        return empty;
    }

    public updateState(contextUpdate: string, inventoryUpdate: string, newMessage: GameMessage) {
        const state = this.getState();
        if (contextUpdate) state.context = contextUpdate;
        if (inventoryUpdate) state.inventory = inventoryUpdate;
        if (newMessage) state.history.push(newMessage);
        this.saveState(state);
    }

    public appendUserAction(content: string) {
        const state = this.getState();
        state.history.push({ role: 'user', content });
        this.saveState(state);
    }

    private getEmptyState(): GameState {
        return {
            context: 'You are an adventurer taking your first steps into an unknown world. A strange energy fills the air, and destiny calls.',
            inventory: 'Level 1 Adventurer\\n\\nInventory:\\n- Basic ragged clothes\\n- 5 Gold Pieces\\n- Empty waterskin',
            history: []
        };
    }
}
