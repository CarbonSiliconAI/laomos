
import fs from 'fs-extra';
import path from 'path';

export class FileSystemManager {
    private rootDir: string;

    constructor(rootDir: string = path.join(process.cwd(), 'storage')) {
        this.rootDir = rootDir;
    }

    async initFileSystem(): Promise<void> {
        const dirs = [
            'system',
            'personal',
            'public'
        ];

        for (const dir of dirs) {
            const dirPath = path.join(this.rootDir, dir);
            try {
                await fs.ensureDir(dirPath);
                console.log(`[FS] Directory ensured: ${dirPath}`);
            } catch (error) {
                console.error(`[FS] Error creating directory ${dirPath}:`, error);
                throw error;
            }
        }
    }

    getSystemDir(): string {
        return path.join(this.rootDir, 'system');
    }

    getPersonalDir(): string {
        return path.join(this.rootDir, 'personal');
    }

    getPublicDir(): string {
        return path.join(this.rootDir, 'public');
    }

    getRootDir(): string {
        return this.rootDir;
    }

    async listFiles(dirPath: string = this.rootDir): Promise<any[]> {
        // Prevent traversing above rootDir
        const safePath = path.resolve(dirPath);
        if (!safePath.startsWith(path.resolve(this.rootDir))) {
            throw new Error('Access denied');
        }

        const items = await fs.readdir(safePath, { withFileTypes: true });
        return items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(safePath, item.name)
        }));
    }

    async readFile(filePath: string): Promise<string> {
        const safePath = path.resolve(filePath);
        if (!safePath.startsWith(path.resolve(this.rootDir))) {
            throw new Error('Access denied');
        }
        return await fs.readFile(safePath, 'utf-8');
    }

    async createFile(filePath: string, content: string): Promise<void> {
        const safePath = path.resolve(filePath);
        if (!safePath.startsWith(path.resolve(this.rootDir))) {
            throw new Error('Access denied');
        }
        await fs.ensureFile(safePath);
        await fs.writeFile(safePath, content, 'utf-8');
    }
}
