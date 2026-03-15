import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import AdmZip from 'adm-zip';
import { execSync } from 'child_process';

export interface DetectedScript {
    /** Filename, e.g. "polymarket.py" */
    filename: string;
    /** Absolute path to the script */
    absolutePath: string;
    /** Extension: py | sh | js */
    ext: string;
    /** True if the Python file has inline uv deps (# /// script) */
    hasUvDeps: boolean;
    /** The recommended run command for this script */
    runCommand: string;
}

/** A command pattern extracted from bash code blocks in SKILL.md */
export interface ExtractedCommand {
    /** The raw command line from the code block */
    raw: string;
    /** The binary/executable at the start, e.g. "python3", "curl", "gog" */
    binary: string;
    /** Whether this binary is available on path */
    available: boolean;
    /** Resolved command with absolute paths (if {baseDir} was present) */
    resolved: string;
}

/** Complete runtime info for a skill, computed once at load time */
export interface SkillRuntime {
    /** Absolute path to the skill directory */
    skillDir: string;
    /** Scripts found in skillDir (root + scripts/ subfolder) */
    detectedScripts: DetectedScript[];
    /** Command examples extracted from SKILL.md ``` bash code blocks */
    extractedCommands: ExtractedCommand[];
    /** Required binaries declared in metadata.requires.bins */
    requiredBins: string[];
    /** Map of binary name → available on PATH */
    binAvailability: Record<string, boolean>;
    /** True if skill has an ## Installation section */
    hasInstallSection: boolean;
}

export interface OpenClawSkill {
    name: string;
    description: string;
    instructions: string;
    metadata?: Record<string, any>;
    runtime?: SkillRuntime;
}

export class SkillLoader {
    private skillsDir: string;
    private cachedSkills: OpenClawSkill[] = [];
    private lastLoadTime: number = 0;
    /** Cache of binary availability checks to avoid repeated `which` calls */
    private binCache = new Map<string, boolean>();

    constructor(rootDir: string) {
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

    private extractZipFiles(dir: string) {
        if (!fs.existsSync(dir)) return;
        const list = fs.readdirSync(dir);
        for (const file of list) {
            if (file.toLowerCase().endsWith('.zip')) {
                const zipPath = path.join(dir, file);
                const extractFolderName = path.basename(file, path.extname(file));
                const extractPath = path.join(dir, extractFolderName);
                try {
                    console.log(`[SkillLoader] Extracting ${file} to ${extractPath}...`);
                    const zip = new AdmZip(zipPath);
                    zip.extractAllTo(extractPath, true);
                    console.log(`[SkillLoader] Successfully extracted ${file}, deleting archive.`);
                    fs.unlinkSync(zipPath);
                } catch (error) {
                    console.error(`[SkillLoader] Failed to extract ${zipPath}:`, error);
                }
            }
        }
    }

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

    // ── Binary availability check ─────────────────────────────────

    /**
     * Check if a binary is available on PATH (cached).
     */
    public isBinAvailable(bin: string): boolean {
        if (this.binCache.has(bin)) return this.binCache.get(bin)!;
        try {
            const os = require('os');
            const homeBin = path.join(os.homedir(), '.laomos', 'bin');
            const envPath = `${homeBin}${path.delimiter}/opt/homebrew/bin${path.delimiter}/usr/local/bin${path.delimiter}${process.env.PATH}`;
            execSync(`which ${bin}`, { env: { ...process.env, PATH: envPath }, stdio: 'pipe' });
            this.binCache.set(bin, true);
            return true;
        } catch {
            this.binCache.set(bin, false);
            return false;
        }
    }

    // ── Script detection ──────────────────────────────────

    /**
     * Scan a skill directory for executable scripts (.py, .sh, .js).
     * Checks Python files for uv inline dependency headers.
     */
    public detectScripts(skillDir: string): DetectedScript[] {
        const scripts: DetectedScript[] = [];
        const scriptExts = new Set(['.py', '.sh', '.js']);

        const dirsToScan = [skillDir];
        const scriptsSubDir = path.join(skillDir, 'scripts');
        if (fs.existsSync(scriptsSubDir) && fs.statSync(scriptsSubDir).isDirectory()) {
            dirsToScan.push(scriptsSubDir);
        }

        for (const dir of dirsToScan) {
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const ext = path.extname(file).toLowerCase();
                    if (!scriptExts.has(ext)) continue;

                    const absPath = path.join(dir, file);
                    if (!fs.statSync(absPath).isFile()) continue;

                    let hasUvDeps = false;
                    let runCommand = '';

                    if (ext === '.py') {
                        try {
                            const head = fs.readFileSync(absPath, 'utf8').substring(0, 500);
                            hasUvDeps = /^#\s*\/\/\/\s*script\s*$/m.test(head);
                        } catch { }

                        if (hasUvDeps && this.isBinAvailable('uv')) {
                            runCommand = `uv run --script "${absPath}"`;
                        } else {
                            runCommand = `python3 "${absPath}"`;
                        }
                    } else if (ext === '.sh') {
                        runCommand = `bash "${absPath}"`;
                    } else if (ext === '.js') {
                        runCommand = `node "${absPath}"`;
                    }

                    scripts.push({ filename: file, absolutePath: absPath, ext: ext.slice(1), hasUvDeps, runCommand });
                }
            } catch { }
        }
        return scripts;
    }

    // ── Command extraction from SKILL.md ──────────────────

    /**
     * Parse all bash/shell code blocks from SKILL.md instructions and extract
     * the individual commands. This tells the LLM exactly what commands
     * the skill supports.
     */
    public extractCommands(instructions: string, skillDir: string): ExtractedCommand[] {
        const commands: ExtractedCommand[] = [];
        const seen = new Set<string>();

        // Match ```bash or ```shell or ``` code blocks
        const codeBlockRegex = /```(?:bash|shell|sh)?\s*\n([\s\S]*?)```/g;
        let blockMatch;
        while ((blockMatch = codeBlockRegex.exec(instructions)) !== null) {
            const block = blockMatch[1];
            // Split block into individual lines, filter out comments and blanks
            const lines = block.split('\n')
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#') && !l.startsWith('//'));

            for (const line of lines) {
                // Skip lines that are just output examples
                if (line.startsWith('Output:') || line.startsWith('→') || line.startsWith('{')) continue;

                // Extract the binary (first word, ignoring env vars and pipes)
                let cmdLine = line;
                // Remove leading env var assignments like GOG_ACCOUNT=x
                cmdLine = cmdLine.replace(/^[A-Z_]+=\S+\s+/, '');
                // Remove leading command chaining (&&, ||)
                if (cmdLine.startsWith('&&') || cmdLine.startsWith('||')) {
                    cmdLine = cmdLine.replace(/^[&|]+\s*/, '');
                }

                const binary = cmdLine.split(/\s+/)[0];
                if (!binary || binary.length < 2) continue;

                // De-duplicate by binary + first argument
                const dedupeKey = cmdLine.substring(0, 60);
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);

                const available = this.isBinAvailable(binary);

                commands.push({
                    raw: line,
                    binary,
                    available,
                    resolved: line, // Already resolved ({baseDir} was replaced earlier)
                });
            }
        }

        // Also extract inline backtick commands that look like CLI invocations
        // e.g.: "Use `gog gmail search 'newer_than:7d'`"
        const inlineRegex = /`((?:python3|node|bash|curl|pip|pip3|uv|brew|npm|npx|gog|nano-pdf|lk)\s[^`]+)`/g;
        let inlineMatch;
        while ((inlineMatch = inlineRegex.exec(instructions)) !== null) {
            const cmd = inlineMatch[1].trim();
            const binary = cmd.split(/\s+/)[0];
            const dedupeKey = cmd.substring(0, 60);
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            commands.push({
                raw: cmd,
                binary,
                available: this.isBinAvailable(binary),
                resolved: cmd,
            });
        }

        return commands;
    }

    // ── Runtime builder ──────────────────────────────────

    /**
     * Build a complete runtime context for a skill: scripts, commands,
     * binary availability, install section detection.
     */
    public buildRuntime(skillDir: string, instructions: string, metadata: Record<string, any>): SkillRuntime {
        const detectedScripts = this.detectScripts(skillDir);
        const extractedCommands = this.extractCommands(instructions, skillDir);

        // Get required bins from metadata
        let requiredBins: string[] = [];
        try {
            const clawMeta = metadata?.clawdbot || metadata?.openclaw || {};
            const reqBins = clawMeta?.requires?.bins || [];
            if (Array.isArray(reqBins)) requiredBins = reqBins;
        } catch { }

        // Also infer required bins from extracted commands
        const inferredBins = new Set<string>(requiredBins);
        for (const cmd of extractedCommands) {
            if (cmd.binary && cmd.binary.length >= 2 && !cmd.binary.startsWith('/') && !cmd.binary.startsWith('.')) {
                inferredBins.add(cmd.binary);
            }
        }
        requiredBins = Array.from(inferredBins);

        // Check availability
        const binAvailability: Record<string, boolean> = {};
        for (const bin of requiredBins) {
            binAvailability[bin] = this.isBinAvailable(bin);
        }

        // Check for installation section
        const hasInstallSection = /^##?\s*(installation|setup|install|dependencies)/im.test(instructions);

        return {
            skillDir,
            detectedScripts,
            extractedCommands,
            requiredBins,
            binAvailability,
            hasInstallSection,
        };
    }

    /**
     * Generate a human-readable runtime context block to inject into the LLM system prompt.
     * This tells the LLM exactly what's available, what commands to use, and what's missing.
     */
    public formatRuntimeContext(runtime: SkillRuntime): string {
        const sections: string[] = [];

        // 1. Available scripts
        if (runtime.detectedScripts.length > 0) {
            sections.push('## Available Scripts');
            sections.push(`Skill directory: ${runtime.skillDir}`);
            for (const s of runtime.detectedScripts) {
                const note = s.hasUvDeps ? ' ⚡ has inline deps → prefer "uv run"' : '';
                sections.push(`  • ${s.filename} → ${s.runCommand}${note}`);
            }
        }

        // 2. Binary availability
        const missing = Object.entries(runtime.binAvailability).filter(([, ok]) => !ok).map(([b]) => b);
        const available = Object.entries(runtime.binAvailability).filter(([, ok]) => ok).map(([b]) => b);
        if (available.length > 0) {
            sections.push(`\n## Available Binaries: ${available.join(', ')}`);
        }
        if (missing.length > 0) {
            sections.push(`\n## ⚠ Missing Binaries: ${missing.join(', ')}`);
            sections.push('These commands are NOT currently installed. If a command fails, check if it needs to be installed first.');
            if (runtime.hasInstallSection) {
                sections.push('There is an Installation section in the skill docs — follow it if needed.');
            }
        }

        // 3. Example commands from SKILL.md (de-duplicated, top 15)
        if (runtime.extractedCommands.length > 0) {
            sections.push('\n## Example Commands from Skill Docs');
            sections.push('Use these as templates. Adjust arguments as needed for the user\'s request.');
            const top = runtime.extractedCommands.slice(0, 15);
            for (const cmd of top) {
                const status = cmd.available ? '✓' : '✗';
                sections.push(`  ${status} ${cmd.resolved}`);
            }
            if (runtime.extractedCommands.length > 15) {
                sections.push(`  ... and ${runtime.extractedCommands.length - 15} more commands in skill docs`);
            }
        }

        return sections.join('\n');
    }

    // ── Main loader ──────────────────────────────────

    public loadSkills(forceRefresh: boolean = false): OpenClawSkill[] {
        if (!forceRefresh && (Date.now() - this.lastLoadTime < 60000)) {
            console.log(`[SkillLoader] Returning ${this.cachedSkills.length} skills from cache.`);
            return this.cachedSkills;
        }

        console.log(`[SkillLoader] Cache expired or forced refresh. Scanning ${this.skillsDir}...`);
        this.extractZipFiles(this.skillsDir);
        // Clear binary cache on reload
        this.binCache.clear();

        const skillFiles = this.findSkillFiles(this.skillsDir);
        const parsedSkills: OpenClawSkill[] = [];

        for (const file of skillFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const parsed = matter(content);

                const defaultName = path.basename(path.dirname(file)) || 'UnnamedSkill';
                const skillDir = path.dirname(file);

                let instructions = parsed.content.trim();
                instructions = instructions.replace(/\{baseDir\}/g, skillDir);

                // Parse metadata (might be a JSON string or object)
                let metadataObj = parsed.data || {};
                if (typeof metadataObj.metadata === 'string') {
                    try { metadataObj = { ...metadataObj, ...JSON.parse(metadataObj.metadata) }; } catch { }
                }

                // Build the universal runtime context
                const runtime = this.buildRuntime(skillDir, instructions, metadataObj);

                parsedSkills.push({
                    name: parsed.data.name || defaultName,
                    description: parsed.data.description || 'No description provided.',
                    instructions,
                    metadata: { ...metadataObj, skillDir },
                    runtime,
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
