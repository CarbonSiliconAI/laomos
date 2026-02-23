
import fs from 'fs-extra';
import path from 'path';

export interface GraphNode {
    id: string;
    label: string;
    type: string; // e.g., 'agent', 'file', 'memory'
    data?: any;
}

export interface GraphEdge {
    source: string;
    target: string;
    relation: string;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export class GraphManager {
    private graphPath: string;
    private data: GraphData = { nodes: [], edges: [] };
    private initialized: boolean = false;

    constructor(systemDir: string) {
        this.graphPath = path.join(systemDir, 'graph.json');
    }

    private async ensureLoaded(): Promise<void> {
        if (this.initialized) return;

        try {
            await fs.ensureFile(this.graphPath);
            const content = await fs.readFile(this.graphPath, 'utf-8');
            if (content.trim()) {
                this.data = JSON.parse(content);
            } else {
                this.data = { nodes: [], edges: [] };
                await this.save();
            }
            this.initialized = true;
        } catch (error) {
            console.error('[Graph] Error loading graph:', error);
            this.data = { nodes: [], edges: [] };
        }
    }

    private async save(): Promise<void> {
        try {
            await fs.writeJSON(this.graphPath, this.data, { spaces: 2 });
        } catch (error) {
            console.error('[Graph] Error saving graph:', error);
        }
    }

    async addNode(node: GraphNode): Promise<void> {
        await this.ensureLoaded();
        if (!this.data.nodes.find(n => n.id === node.id)) {
            this.data.nodes.push(node);
            await this.save();
            console.log(`[Graph] Node added: ${node.label} (${node.type})`);
        }
    }

    async addEdge(edge: GraphEdge): Promise<void> {
        await this.ensureLoaded();
        // Check if edge already exists to avoid duplicates
        const exists = this.data.edges.some(e =>
            e.source === edge.source &&
            e.target === edge.target &&
            e.relation === edge.relation
        );

        if (!exists) {
            this.data.edges.push(edge);
            await this.save();
            console.log(`[Graph] Edge added: ${edge.source} -> ${edge.target}`);
        }
    }

    async getGraph(): Promise<GraphData> {
        await this.ensureLoaded();
        return this.data;
    }
}
