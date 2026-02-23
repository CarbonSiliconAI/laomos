
import fs from 'fs-extra';
import path from 'path';

interface KeyStorage {
    [provider: string]: string;
}

export class IdentityManager {
    private keyFilePath: string;
    private initialized: boolean = false;

    constructor(systemDir: string) {
        this.keyFilePath = path.join(systemDir, 'keys.json');
    }

    private async ensureFile(): Promise<void> {
        if (!this.initialized) {
            try {
                await fs.ensureFile(this.keyFilePath);
                const content = await fs.readFile(this.keyFilePath, 'utf-8');
                if (!content.trim()) {
                    await fs.writeJSON(this.keyFilePath, {});
                }
                this.initialized = true;
            } catch (error) {
                console.error('[Identity] Error initializing key store:', error);
                throw error;
            }
        }
    }

    async addKey(provider: string, key: string): Promise<void> {
        await this.ensureFile();
        const keys: KeyStorage = await fs.readJSON(this.keyFilePath);
        keys[provider] = key;
        await fs.writeJSON(this.keyFilePath, keys, { spaces: 2 });
        console.log(`[Identity] Key added for provider: ${provider}`);
    }

    async getKey(provider: string): Promise<string | undefined> {
        await this.ensureFile();
        const keys: KeyStorage = await fs.readJSON(this.keyFilePath);
        return keys[provider];
    }

    async getAllKeys(): Promise<KeyStorage> {
        await this.ensureFile();
        return await fs.readJSON(this.keyFilePath);
    }

    async deleteKey(provider: string): Promise<void> {
        await this.ensureFile();
        const keys: KeyStorage = await fs.readJSON(this.keyFilePath);
        if (keys[provider]) {
            delete keys[provider];
            await fs.writeJSON(this.keyFilePath, keys, { spaces: 2 });
            console.log(`[Identity] Key deleted for provider: ${provider}`);
        }
    }
}
