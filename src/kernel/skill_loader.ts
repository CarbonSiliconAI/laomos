import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

export interface OpenClawSkill {
    name: string;
    description: string;
    instructions: string;
    metadata?: Record<string, any>;
}

export class SkillLoader {
    private skillsDir: string;
    private cachedSkills: OpenClawSkill[] = [];
    private lastLoadTime: number = 0;

    constructor(rootDir: string) {
        // fsManager.getRootDir() already returns the 'storage' path.
        this.skillsDir = path.join(rootDir, 'skills');
        this.ensureSkillsDirExists();
    }

    private ensureSkillsDirExists() {
        if (!fs.existsSync(this.skillsDir)) {
            console.log(`[SkillLoader] Creating skills directory at ${this.skillsDir}`);
            fs.mkdirSync(this.skillsDir, { recursive: true });
        } else {
            console.log(`[SkillLoader] Using existing skills directory at ${this.skillsDir}`);
        }
    }

    /**
     * Finds all SKILL.md files within the skills directory.
     */
    private findSkillFiles(dir: string): string[] {
        let results: string[] = [];
        if (!fs.existsSync(dir)) return results;

        const list = fs.readdirSync(dir);
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(this.findSkillFiles(filePath));
            } else if (file.toLowerCase() === 'skill.md') {
                results.push(filePath);
            }
        }
        return results;
    }

    /**
     * Loads and parses all OpenClaw SKILL.md files.
     * Caches results to avoid frequent disk I/O.
     * @param forceRefresh Set to true to bypass cache.
     */
    public loadSkills(forceRefresh: boolean = false): OpenClawSkill[] {
        // Simple cache TTL of 60 seconds
        if (!forceRefresh && (Date.now() - this.lastLoadTime < 60000)) {
            console.log(`[SkillLoader] Returning ${this.cachedSkills.length} skills from cache.`);
            return this.cachedSkills;
        }

        console.log(`[SkillLoader] Cache expired or forced refresh. Scanning ${this.skillsDir}...`);
        const skillFiles = this.findSkillFiles(this.skillsDir);
        const parsedSkills: OpenClawSkill[] = [];

        for (const file of skillFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const parsed = matter(content);

                // Fallback for missing frontmatter name/description
                const defaultName = path.basename(path.dirname(file)) || 'UnnamedSkill';

                parsedSkills.push({
                    name: parsed.data.name || defaultName,
                    description: parsed.data.description || 'No description provided.',
                    instructions: parsed.content.trim(),
                    metadata: parsed.data
                });
            } catch (error) {
                console.error(`[SkillLoader] Failed to load skill at ${file}:`, error);
            }
        }

        this.cachedSkills = parsedSkills;
        this.lastLoadTime = Date.now();
        console.log(`[SkillLoader] Scanned ${this.skillsDir}, loaded ${parsedSkills.length} OpenClaw skills.`);

        return parsedSkills;
    }

    /**
     * Formats the loaded skills into a string chunk suitable for injecting into the LLM context.
     */
    public getFormattedSkillContext(): string {
        const skills = this.loadSkills();
        if (skills.length === 0) return '';

        let contextChunks = ['\n[Active OpenClaw Skills]:'];
        contextChunks.push('The following specialized skills are currently active. If the user\'s request relates to these skills, you MUST follow their instructions implicitly.\n');

        skills.forEach(skill => {
            contextChunks.push(`--- SKILL: ${skill.name} ---`);
            contextChunks.push(`Description: ${skill.description}`);
            contextChunks.push(`Instructions:\n${skill.instructions}\n`);
        });

        return contextChunks.join('\n');
    }
}
