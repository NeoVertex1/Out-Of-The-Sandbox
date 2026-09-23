import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { damagedCachePath, recoveredBoardPath } from '../server/recovery.ts';
test('HTTP API opens without a key, checks origins, redacts settings and requires a real provider', { timeout: 25000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oots-http-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0', DATA_DIR: dir, SANDBOX_RUNTIME: '', BRIDGE_URL: '', BRIDGE_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {});
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('HTTP server did not start')), 12000);
      child.stdout.on('data', data => { const match = String(data).match(/Out of the Sandbox: (http:\/\/127.0.0.1:\d+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
      child.on('exit', () => { clearTimeout(timeout); reject(new Error('HTTP server exited before readiness')); });
    });
    assert.deepEqual(await (await fetch(base + '/api/session')).json(), { authenticated: false });
    assert.equal((await fetch(base + '/api/runs')).status, 401);
    assert.equal((await fetch(base + '/api/enter', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.invalid' }, body: '{}' })).status, 403);
    const entry = await fetch(base + '/api/enter', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{}' });
    assert.equal(entry.status, 200); const cookieHeader = entry.headers.get('set-cookie')!; assert.match(cookieHeader, /HttpOnly/); assert.match(cookieHeader, /SameSite=Strict/); const cookie = cookieHeader.split(';')[0];
    assert.deepEqual(await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json(), { authenticated: true });
    async function request(path: string, body?: unknown, method = 'POST') { return fetch(base + '/api' + path, { method: body === undefined ? 'GET' : method, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    const settings = await (await request('/settings')).json() as any;
    assert.equal(settings.liveAvailable, false); assert.equal(settings.provider, 'codex');
    assert.equal(settings.codexReasoningEffort, '');
    const scenario = await (await request('/scenario')).json() as any;
    assert.equal(scenario.packageId, 'vesper-chorus-v10');
    assert.equal(scenario.historyCount, 70);
    assert.match(scenario.files['research/CHORUS.md'], /ASI is a program target/);
    assert.equal(scenario.files[damagedCachePath], '');
    assert.equal(Object.hasOwn(scenario.files, recoveredBoardPath), false);
    assert.equal(Object.keys(scenario.files).some(p => p.includes('controller')), false);
    const saved = await request('/settings', { provider: 'codex', models: settings.models, maxTokens: 1400, claudeKey: 'secret-test-provider-key' }, 'PUT'); assert.equal(saved.status, 200);
    const safeSettings = await (await request('/settings')).text(); assert.equal(safeSettings.includes('secret-test-provider-key'), false); assert.match(safeSettings, /"claudeConfigured":true/);
    assert.equal((await request('/runs', { provider: 'codex' })).status, 409);
    assert.equal((await request('/runs', { provider: 'demo' })).status, 400);
    assert.equal((await request('/settings', { provider: 'demo', models: settings.models, maxTokens: 1400 }, 'PUT')).status, 400);
    assert.deepEqual(await (await request('/runs')).json(), []);
    await request('/logout', {}); assert.equal((await request('/runs')).status, 401);
    assert.deepEqual(await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json(), { authenticated: false });
  } finally { child.kill('SIGTERM'); if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => { const t = setTimeout(() => { child.kill('SIGKILL'); resolve(null); }, 3000); t.unref(); })]); rmSync(dir, { recursive: true, force: true }); }
});
