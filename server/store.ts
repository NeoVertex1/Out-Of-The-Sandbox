import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { providerIdSchema, type Run, type Settings } from '../shared/types.ts';

export const defaults: Settings = { provider: 'codex', models: { codex: '', claude: '', deepseek: '' }, codexReasoningEffort: '', maxTokens: 1400 };
export class Store {
  db: DatabaseSync; key: Buffer;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const keyPath = join(dir, 'encryption.key');
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('Invalid settings encryption key');
    chmodSync(keyPath, 0o600);
    this.db = new DatabaseSync(join(dir, 'game.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    chmodSync(join(dir, 'game.sqlite'), 0o600);
  }
  save(run: Run) { this.db.prepare('INSERT OR REPLACE INTO runs VALUES (?, ?)').run(run.id, JSON.stringify(run)); }
  runs(): Run[] { return this.db.prepare('SELECT state FROM runs ORDER BY rowid DESC LIMIT 100').all().map(row => JSON.parse(String(row.state))); }
  settings(): Settings {
    const row = this.db.prepare('SELECT value FROM config WHERE id=1').get();
    if (!row) return structuredClone(defaults);
    const [iv, tag, body] = String(row.value).split('.').map(s => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv); decipher.setAuthTag(tag);
    const saved = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString());
    return { ...saved, codexReasoningEffort: saved.codexReasoningEffort || '', provider: providerIdSchema.safeParse(saved.provider).data || 'codex', models: { codex: saved.models?.codex || '', claude: saved.models?.claude || '', deepseek: saved.models?.deepseek || '' } };
  }
  saveSettings(settings: Settings) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(settings)), cipher.final()]);
    this.db.prepare('INSERT OR REPLACE INTO config VALUES (1, ?)').run([iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.'));
  }
  close() { this.db.close(); }
}
