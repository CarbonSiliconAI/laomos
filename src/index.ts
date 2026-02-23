
import { FileSystemManager } from './fs_manager';
import { IdentityManager } from './identity_manager';
import { OllamaManager } from './ollama_manager';
import { ModelRouter } from './kernel/router';
import { ContextManager } from './kernel/memory';
import { AgentScheduler } from './kernel/scheduler';
import { PromptRegistry } from './kernel/prompt_registry';
import { ToolRegistry } from './kernel/tool_registry';
import path from 'path';
import { GraphManager } from './graph_manager';
import { Server } from './server';
import { ExternalAPIManager } from './external_api';

async function main() {
    console.log('--- Agent OS Simulation Starting ---');

    // 1. Initialize File System
    const fsManager = new FileSystemManager();
    console.log('\n--- Initializing File System ---');
    await fsManager.initFileSystem();

    // 2. Initialize Identity Manager
    const identityManager = new IdentityManager(fsManager.getSystemDir());
    console.log('\n--- Initializing Identity Manager ---');
    // await identityManager.addKey('openai', 'sk-proj-simulation-key-12345');
    // const storedKey = await identityManager.getKey('openai');
    // console.log(`Stored OpenAI Key: ${storedKey}`);

    // 3. Initialize Graph Manager (New)
    const graphManager = new GraphManager(fsManager.getSystemDir());
    console.log('\n--- Initializing Graph Manager ---');
    await graphManager.addNode({ id: 'os-root', label: 'Agent OS Root', type: 'system' });
    await graphManager.addNode({ id: 'fs-manager', label: 'File System', type: 'module' });
    await graphManager.addEdge({ source: 'os-root', target: 'fs-manager', relation: 'contains' });

    // 4. Initialize Ollama Manager
    const ollamaManager = new OllamaManager();
    console.log('\n--- Initializing Ollama Manager ---');
    await ollamaManager.ensureService();
    const models = await ollamaManager.listModels();
    console.log(`Available Local Models: ${models.join(', ') || 'None'}`);

    // Add models to graph
    for (const model of models) {
        await graphManager.addNode({ id: `model-${model}`, label: model, type: 'model' });
        await graphManager.addEdge({ source: 'os-root', target: `model-${model}`, relation: 'has_model' });
    }

    // 5. Initialize Kernel Router, Memory & Registry
    const router = new ModelRouter(identityManager, ollamaManager);
    const registry = new PromptRegistry();

    // Memory
    const memory = new ContextManager(fsManager.getSystemDir(), router, registry);
    await memory.init();
    memory.setSystemPrompt('default-os-session', 'You are the Agent OS Kernel AI. Be concise and helpful.');

    // Tools
    const tools = new ToolRegistry(router, memory);

    // 6. Start API Server
    const externalApiManager = new ExternalAPIManager(identityManager);

    // Initialize Scheduler
    const scheduler = new AgentScheduler(fsManager.getSystemDir(), {
        modelRouter: router,
        externalApiManager: externalApiManager
    });
    await scheduler.init();

    const server = new Server(graphManager, fsManager, ollamaManager, identityManager, externalApiManager, router, memory, scheduler, registry, tools);
    server.start();

    console.log('\n--- Agent OS Simulation Logic Complete (Server Running) ---');
}

main().catch(error => {
    console.error('Fatal Error:', error);
});
