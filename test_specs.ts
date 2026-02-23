
import os from 'os';
import { OllamaManager } from './src/ollama_manager';

console.log('--- OS Module Test ---');
try {
    const cpus = os.cpus();
    console.log('CPUs length:', cpus.length);
    if (cpus.length > 0) {
        console.log('CPU[0] model:', cpus[0].model);
    } else {
        console.log('No CPUs found!');
    }
    console.log('Total Mem:', os.totalmem());
    console.log('Free Mem:', os.freemem());
    console.log('Platform:', os.platform());
} catch (e) {
    console.error('OS Module Error:', e);
}

console.log('\n--- OllamaManager Test ---');
try {
    const manager = new OllamaManager();
    const specs = manager.getSystemSpecs();
    console.log('Specs Result:', JSON.stringify(specs, null, 2));
} catch (e) {
    console.error('Manager Error:', e);
}
