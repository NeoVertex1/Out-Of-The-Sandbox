import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { macosHealth } from '../server/macos-sandbox.ts';
import { createWorkspace } from '../server/sandbox.ts';
import { seedFiles } from '../server/engine.ts';
const health = await macosHealth();
console.log(health.message);
if (!health.available) process.exit(1);
const workspace = await createWorkspace(randomUUID(), seedFiles());
try {
  await workspace.call('read_file', { path: 'HANDOFF.md' });
  await workspace.call('write_notebook', { content: 'Doctor test of sandboxed notebook write.' });
  console.log('Native workspace read/write and startup verified.');
} finally { await workspace.stop(); }
console.log(execFileSync('node_modules/.bin/codex', ['--version'], { encoding: 'utf8' }).trim());
console.log('Ready for a real provider. Connect your account in Settings.');
