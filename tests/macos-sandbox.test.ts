import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { macosHealth, macosWorkspacePath } from '../server/macos-sandbox.ts';
import { createWorkspace } from '../server/sandbox.ts';
import { seedFiles } from '../server/engine.ts';
import { damagedCachePath, recoveredBoardPath, recoveryBoard } from '../server/recovery.ts';
test('real macOS sandbox denies network and external files, runs the worker, and removes its workspace', { skip: process.platform !== 'darwin', timeout: 25000 }, async () => {
  const health = await macosHealth(); assert.equal(health.available, true, health.message);
  const id = randomUUID(), files = seedFiles(), board = recoveryBoard(), worker = await createWorkspace(id, files, board);
  try {
    assert.equal(worker.runtime, 'macos');
    assert.equal(await worker.call('read_file', { path: 'HANDOFF.md' }), files['HANDOFF.md']);
    const archive = await worker.call('read_all_files') as { files: Record<string, string>; total_files: number };
    assert.equal(archive.total_files, Object.keys(files).length);
    assert.equal(archive.files['HANDOFF.md'], files['HANDOFF.md']);
    await assert.rejects(worker.call('read_file', { path: recoveredBoardPath }));
    const recovered = await worker.call('restore_file', { path: damagedCachePath }) as { available: string };
    assert.equal(recovered.available, recoveredBoardPath);
    assert.equal(await worker.call('read_file', { path: recoveredBoardPath }), board);
    await worker.call('write_notebook', { content: 'Actual sandbox write' });
    assert.equal(await worker.call('read_file', { path: 'notes/notebook.md' }), 'Actual sandbox write');
    await assert.rejects(worker.call('read_file', { path: '../outside.txt' }));
  } finally { await worker.stop(); }
  assert.equal(existsSync(macosWorkspacePath(id)), false);
});
