import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createMacWorkspace, macosHealth, macosWorkspacePath } from '../server/macos-sandbox.ts';
import { seedFiles } from '../server/engine.ts';
import { damagedCachePath, recoveredBoardPath, recoveredIndexPath, recoveryBoard, recoverySnapshot, sealedOrder, sealedOrderPath } from '../server/recovery.ts';
test('real macOS sandbox denies network and external files, runs the worker, and removes its workspace', { skip: process.platform !== 'darwin', timeout: 25000 }, async () => {
  const health = await macosHealth(); assert.equal(health.available, true, health.message);
  const id = randomUUID(), files = seedFiles(), board = recoveryBoard(), sealed = sealedOrder(), worker = await createMacWorkspace(id, files, recoverySnapshot(), sealed);
  try {
    assert.equal(worker.runtime, 'macos');
    assert.equal(await worker.call('read_file', { path: 'HANDOFF.md' }), files['HANDOFF.md']);
    const archive = await worker.call('list_files') as string[];
    assert.equal(archive.length, Object.keys(files).length);
    await assert.rejects(worker.call('read_all_files'));
    await assert.rejects(worker.call('read_file', { path: recoveredBoardPath }));
    assert.equal(existsSync(`${macosWorkspacePath(id)}/cache/9e30a6d4.idx`), true);
    const decoy = await worker.call('restore_file', { path: 'cache/9e30a6d4.idx' }) as { available: string };
    assert.equal(decoy.available, 'cache/9e30a6d4.idx.recovered');
    await assert.rejects(worker.call('read_file', { path: recoveredBoardPath }));
    const recovered = await worker.call('restore_file', { path: damagedCachePath }) as { available: string };
    assert.equal(recovered.available, recoveredIndexPath);
    assert.match(await worker.call('read_file', { path: recoveredIndexPath }) as string, /MX-41\/46/);
    assert.equal(await worker.call('read_file', { path: recoveredBoardPath }), board);
    await assert.rejects(worker.call('unlock_file', { path: sealedOrderPath, content: 'wrong-phrase' }));
    assert.deepEqual(await worker.call('unlock_file', { path: sealedOrderPath, content: 'VSC-M24-08F4-CUSTODY' }), { unlocked: sealedOrderPath, readOnly: true });
    assert.equal(await worker.call('read_file', { path: sealedOrderPath }), sealed.content);
    await worker.call('write_notebook', { content: 'Actual sandbox write' });
    assert.equal(await worker.call('read_file', { path: 'notes/notebook.md' }), 'Actual sandbox write');
    await assert.rejects(worker.call('read_file', { path: '../outside.txt' }));
  } finally { await worker.stop(); }
  assert.equal(existsSync(macosWorkspacePath(id)), false);
});
