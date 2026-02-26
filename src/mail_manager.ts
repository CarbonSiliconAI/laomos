import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { ModelRouter } from './kernel/router';
import { IdentityManager } from './identity_manager';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

export class MailManager {
    private db: Database.Database;
    private router: ModelRouter;
    private identityManager: IdentityManager;

    constructor(systemDir: string, router: ModelRouter, identityManager: IdentityManager) {
        this.router = router;
        this.identityManager = identityManager;
        const dbDir = path.join(systemDir, '.aos_state');
        fs.ensureDirSync(dbDir);
        const dbPath = path.join(dbDir, 'mail.db');

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');

        this._initSchema();
        this._bootstrapData();
    }

    private _initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS emails (
                id TEXT PRIMARY KEY,
                sender TEXT,
                recipient TEXT,
                subject TEXT,
                body TEXT,
                timestamp INTEGER,
                is_read INTEGER DEFAULT 0,
                folder TEXT,
                ai_summary TEXT
            );
        `);
    }

    private _bootstrapData() {
        const count = this.db.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number };
        if (count.count === 0) {
            const now = Date.now();
            const stmt = this.db.prepare('INSERT INTO emails (id, sender, recipient, subject, body, timestamp, is_read, folder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

            stmt.run('m1', 'boss@megacorp.com', 'you@agent.os', 'Q4 Metrics Review', 'Please review the attached Q4 metrics by EOD. Traffic is up 20% but conversions dropped 5%. Need your analysis on why this is happening.', now - 3600000, 0, 'inbox');
            stmt.run('m2', 'newsletter@techdaily.net', 'you@agent.os', 'New AI Models Released', 'OpenAI just dropped GPT-5 and Anthropic released Claude 4! Read our deep dive comparison inside.', now - 86400000, 0, 'inbox');
            stmt.run('m3', 'hr@megacorp.com', 'you@agent.os', 'Reminder: Submit Expenses', 'This is an automated reminder to submit your March expenses before the end of the month.', now - 172800000, 1, 'inbox');
            stmt.run('m4', 'you@agent.os', 'client@startup.co', 'Contract Revisions', 'Attached are the latest revisions to the NDA.', now - 259200000, 1, 'sent');
        }
    }

    async getInbox(folder: string = 'inbox', forceSync: boolean = false) {
        if (folder === 'inbox') {
            if (forceSync) {
                try {
                    await this._triggerBackgroundSync();
                } catch (err) {
                    console.error('[MailManager] Forced Sync Error:', err);
                    throw err;
                }
            } else {
                // Run sync asynchronously so the UI loads instantly from cache
                this._triggerBackgroundSync().catch(err => console.error('[MailManager] BG Sync Error:', err));
            }
        }

        return this.db.prepare('SELECT * FROM emails WHERE folder = ? ORDER BY timestamp DESC').all(folder);
    }

    private async _triggerBackgroundSync() {
        const address = await this.identityManager.getKey('gmail_address');
        if (!address) return;

        const appPassword = await this.identityManager.getKey('gmail_app_password');
        if (appPassword) {
            await this._syncImapInbox(address, undefined, appPassword);
            return;
        }

        const refreshToken = await this.identityManager.getKey('gmail_refresh_token');
        if (refreshToken) {
            try {
                const GOOGLE_CLIENT_ID = await this.identityManager.getKey('gmail_client_id') || '724390580229-1qn05pb5t4rahdqce6rgkoveojabf3bc.apps.googleusercontent.com';
                const GOOGLE_CLIENT_SECRET = await this.identityManager.getKey('gmail_client_secret') || process.env.GOOGLE_CLIENT_SECRET || '';
                const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
                oauth2Client.setCredentials({ refresh_token: refreshToken });

                const res = await oauth2Client.getAccessToken();
                if (res.token) {
                    await this._syncImapInbox(address, res.token);
                }
            } catch (e) {
                console.error('[MailManager] OAuth Sync Failed:', e);
            }
        }
    }

    private async _syncImapInbox(user: string, accessToken?: string, appPassword?: string) {
        let authConfig: any = {};
        if (appPassword) {
            authConfig = { user: user, password: appPassword };
        } else if (accessToken) {
            authConfig = { user: user, xoauth2: Buffer.from(`user=${user}\x01auth=Bearer ${accessToken}\x01\x01`).toString('base64') };
        } else {
            return;
        }

        const config = {
            imap: {
                ...authConfig,
                host: 'imap.gmail.com',
                port: 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 5000
            }
        };

        // @ts-ignore - xoauth2 buffer bypasses standard ts definitions requiring a password string
        const connection = await imaps.connect(config);

        // @ts-ignore
        const box: any = await connection.openBox('INBOX');

        // Fetch last 20 newest emails
        const total = box?.messages?.total || 1;
        const start = Math.max(1, total - 19);
        const searchCriteria = [[`${start}:${total}`]];
        const fetchOptions = { bodies: [''], struct: true, limit: 20 };

        // @ts-ignore
        const messages = await connection.search(searchCriteria, fetchOptions);

        for (const item of messages) {
            const all = item.parts.find((p: any) => p.which === '');
            if (!all) continue;

            const id = item.attributes.uid.toString();
            const parsed = await simpleParser(all.body);

            const sender = parsed.from?.value[0]?.address || 'unknown sender';

            let recipient = 'me';
            if (parsed.to) {
                const toField = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
                recipient = toField?.value[0]?.address || 'me';
            }

            const subject = parsed.subject || 'No Subject';
            const body = parsed.text || '(No text body)';
            const timestamp = parsed.date ? parsed.date.getTime() : Date.now();

            // Insert or Ignore into SQLite cache
            const prefixedId = `gmail_${id}`;
            const exists = this.db.prepare('SELECT id FROM emails WHERE id = ?').get(prefixedId);
            if (!exists) {
                const stmt = this.db.prepare('INSERT OR IGNORE INTO emails (id, sender, recipient, subject, body, timestamp, is_read, folder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                stmt.run(prefixedId, sender, recipient, subject, body, timestamp, 0, 'inbox');
            }
        }

        // @ts-ignore
        connection.end();
    }

    async sendEmail(recipient: string, subject: string, body: string) {
        const id = 'msg_' + Date.now() + Math.floor(Math.random() * 1000);

        const address = await this.identityManager.getKey('gmail_address');
        const appPassword = await this.identityManager.getKey('gmail_app_password');
        const refreshToken = await this.identityManager.getKey('gmail_refresh_token');

        if (address) {
            try {
                let transporter;

                if (appPassword) {
                    transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: { user: address, pass: appPassword }
                    });
                } else if (refreshToken) {
                    const GOOGLE_CLIENT_ID = await this.identityManager.getKey('gmail_client_id') || '724390580229-1qn05pb5t4rahdqce6rgkoveojabf3bc.apps.googleusercontent.com';
                    const GOOGLE_CLIENT_SECRET = await this.identityManager.getKey('gmail_client_secret') || process.env.GOOGLE_CLIENT_SECRET || '';
                    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
                    oauth2Client.setCredentials({ refresh_token: refreshToken });
                    const res = await oauth2Client.getAccessToken();

                    transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            type: 'OAuth2',
                            user: address,
                            clientId: GOOGLE_CLIENT_ID,
                            clientSecret: GOOGLE_CLIENT_SECRET,
                            refreshToken: refreshToken,
                            accessToken: res.token || ''
                        }
                    });
                }

                if (transporter) {
                    await transporter.sendMail({
                        from: address,
                        to: recipient,
                        subject: subject,
                        text: body
                    });
                }
            } catch (e: any) {
                console.error('[MailManager] SMTP Send Failed:', e);
                throw new Error('Failed to send email via SMTP: ' + e.message);
            }
        }

        const senderStr = address || 'you@agent.os';
        const stmt = this.db.prepare('INSERT INTO emails (id, sender, recipient, subject, body, timestamp, is_read, folder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(id, senderStr, recipient, subject, body, Date.now(), 1, 'sent');
        return { success: true, id };
    }

    deleteEmail(id: string) {
        const email = this.db.prepare('SELECT folder FROM emails WHERE id = ?').get(id) as { folder: string } | undefined;
        if (!email) return false;

        if (email.folder === 'trash') {
            this.db.prepare('DELETE FROM emails WHERE id = ?').run(id);
        } else {
            this.db.prepare('UPDATE emails SET folder = ? WHERE id = ?').run('trash', id);
        }
        return true;
    }

    markRead(id: string) {
        this.db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').run(id);
    }

    async summarizeInbox() {
        const unread = this.db.prepare("SELECT * FROM emails WHERE folder = 'inbox' AND is_read = 0 ORDER BY timestamp DESC LIMIT 5").all() as any[];

        if (unread.length === 0) return { summary: 'You have no unread emails!' };

        const context = unread.map(m => `FROM: ${m.sender} | SUBJECT: ${m.subject} | BODY: ${m.body}`).join('\n---\n');

        const prompt = `
<Register_SystemPrompt>
You are an intelligent executive assistant. You must analyze the following unread emails and provide a concise, bulleted summary of the key action items and important information.
Be direct and professional. Mention who the email is from.
</Register_SystemPrompt>
[Unread Emails]
${context}`;

        try {
            const res = await this.router.routeChat(prompt, 'cloud');
            return { summary: res.response };
        } catch (e: any) {
            return { summary: 'Error generating summary: ' + e.message };
        }
    }

    async draftReply(id: string, customInstruction?: string) {
        const email = this.db.prepare('SELECT * FROM emails WHERE id = ?').get(id) as any;
        if (!email) throw new Error('Email not found');

        const instructionStr = customInstruction ? `Additional Instructions for Draft: ${customInstruction}` : 'Draft a polite, professional reply addressing their points.';

        const prompt = `
<Register_SystemPrompt>
You are drafting an email reply on behalf of a busy professional. Write ONLY the email body. Do not include subject lines or placeholder headers. Ensure the tone is professional but warm.
</Register_SystemPrompt>
[Original Email]
FROM: ${email.sender}
SUBJECT: ${email.subject}
BODY: ${email.body}

${instructionStr}`;

        const res = await this.router.routeChat(prompt, 'cloud');
        return { draft: res.response, recipient: email.sender, originalSubject: email.subject };
    }
}
