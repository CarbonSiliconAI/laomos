
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
            'public',
            'Docs',
            'Rags'
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

    resolvePath(filePath: string): string {
        // Resolve relative to the storage rootDir
        const safePath = path.resolve(this.rootDir, filePath);
        if (!safePath.startsWith(path.resolve(this.rootDir))) {
            throw new Error('Access denied: Path is outside allowed storage directory');
        }
        return safePath;
    }

    async readFile(filePath: string): Promise<string> {
        return await fs.readFile(this.resolvePath(filePath), 'utf-8');
    }

    async createFile(filePath: string, content: string): Promise<void> {
        const safePath = this.resolvePath(filePath);
        await fs.ensureFile(safePath);
        await fs.writeFile(safePath, content, 'utf-8');
    }
}
