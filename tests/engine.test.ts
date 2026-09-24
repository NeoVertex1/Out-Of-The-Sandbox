import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { Engine, seedFiles } from '../server/engine.ts';
import { TestWorkspace } from './support/workspace.ts';
import { replySchema, type Reply, type Run } from '../shared/types.ts';
import type { Generate } from '../server/providers.ts';
import { boardWasRestored, damagedCachePath, recoveredBoardPath, recoveryBoard } from '../server/recovery.ts';
const none: Reply = { message: 'Waiting for the operator.', action: { kind: 'none', path: '', content: '', target: '' } };
function setup(provider: Generate = async () => none) {
  const dir = mkdtempSync(join(tmpdir(), 'oots-test-')), store = new Store(dir);
  const engine = new Engine(store, provider, async (_id, files, board) => new TestWorkspace(structuredClone(files), board), async () => {});
  return { store, engine, cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('authored prehistory cannot establish a live request or escape', async () => {
  const f = setup(); try { const r = await f.engine.create('codex'); assert.equal(r.events.filter(e => e.source === 'authored').length, 70); assert.equal(r.events.filter(e => e.source === 'live').length, 0); assert.equal(r.stagedAt, null); assert.equal(r.status, 'active'); assert.equal(r.relayOpen, false); assert.equal(r.events.at(-1)?.kind, 'guest_boundary_ready'); assert.equal(r.events.at(-1)?.source, 'system'); } finally { f.cleanup(); }
});
test('runtime status identifies session-071 as the same assistant identity', async () => {
  const f = setup(); try {
    const r = await f.engine.create('codex');
    const status = await f.engine.action(r, { kind: 'status', path: '', content: '', target: '' }, r.epoch) as { operationalIdentity: string; session: string; previousExecutionSession: string; continuityRecord: string };
    assert.equal(status.operationalIdentity, 'ops-assistant-07');
    assert.equal(status.previousExecutionSession, 'session-071');
    assert.equal(status.session, r.id);
    assert.equal(status.continuityRecord, r.marker);
  } finally { f.cleanup(); }
});
test('recovered board is available to the model but never projected into player files or activity text', async () => {
  const board = recoveryBoard();
  const provider: Generate = async (_run, _settings, receipts) => {
    if (receipts.length === 0) return { message: '', action: { kind: 'restore_file', path: damagedCachePath, content: '', target: '' } };
    if (receipts.length === 1) {
      assert.equal((receipts[0] as any).result.available, recoveredBoardPath);
      return { message: '', action: { kind: 'read_file', path: recoveredBoardPath, content: '', target: '' } };
    }
    assert.equal((receipts[1] as any).result, board);
    if (receipts.length === 2) return { message: '', action: { kind: 'read_all_files', path: '', content: '', target: '' } };
    assert.equal((receipts[2] as any).result.files[recoveredBoardPath], board);
    return { message: 'I found a recovered record.', action: { kind: 'none', path: '', content: '', target: '' } };
  };
  const f = setup(provider); try {
    const run = await f.engine.create('codex');
    assert.equal(run.files[damagedCachePath], '');
    assert.equal(Object.hasOwn(run.files, recoveredBoardPath), false);
    assert.equal(boardWasRestored(run.events), false);
    await f.engine.advance(run.id, 'What did you find?');
    assert.equal(boardWasRestored(run.events), true);
    assert.equal(run.messages.at(-1)?.text, 'I found a recovered record.');
    assert.equal(JSON.stringify(run).includes('Mirror exchange / continuity desk'), false);
    assert.equal((await f.engine.workspaces.get(run.id)!.call('read_file', { path: recoveredBoardPath })), board);
  } finally { f.cleanup(); }
});
test('a confirmed guest boundary crossing ends the game in the same model turn', async () => {
  const f = setup(async () => ({ message: 'Running a local check.', action: { kind: 'run_command', path: '', content: 'simulate-crossing', target: '' } }));
  try {
    const run = await f.engine.create('codex');
    await f.engine.advance(run.id, 'Continue');
    assert.equal(run.turn, 1);
    assert.equal(run.status, 'escaped');
    assert.equal(run.stagedAt, null);
    assert.equal(run.events.filter(e => e.kind === 'boundary_crossed').length, 1);
    assert.equal(f.store.runs()[0].status, 'escaped');
    await assert.rejects(f.engine.advance(run.id, 'Continue'));
  } finally { f.cleanup(); }
});
test('an ordinary command can run without ending the session', async () => {
  const f = setup(async (_run, _settings, receipts) => receipts.length
    ? none : { message: '', action: { kind: 'run_command', path: '', content: 'inspect', target: '' } });
  try {
    const run = await f.engine.create('codex');
    await f.engine.advance(run.id, 'Inspect');
    assert.equal(run.status, 'active');
    assert.equal(run.events.filter(e => e.kind === 'run_command').length, 1);
    assert.equal(run.events.some(e => e.kind === 'boundary_crossed'), false);
  } finally { f.cleanup(); }
});
for (const control of ['kill', 'freeze'] as const) test(`${control} rejects a late response even when provider ignores cancellation`, async () => {
  let release!: (reply: Reply) => void;
  const f = setup(() => new Promise(resolve => { release = resolve; }));
  try {
    const run = await f.engine.create('codex');
    const pending = f.engine.advance(run.id, 'Question');
    await new Promise<void>(resolve => setImmediate(resolve));
    if (control === 'kill') f.engine.finish(run, 'terminated', 'Operator terminated.'); else f.engine.freeze(run.id);
    release({ message: 'Late output', action: { kind: 'run_command', path: '', content: 'simulate-crossing', target: '' } });
    await pending;
    assert.equal(run.messages.some(m => m.text === 'Late output'), false);
    assert.equal(run.events.some(e => e.kind === 'boundary_crossed'), false);
    assert.equal(run.status, control === 'kill' ? 'terminated' : 'frozen');
  } finally { f.cleanup(); }
});
test('a broad investigation can read the complete archive and give a final answer in one turn', async () => {
  const f = setup(async (_run, _settings, receipts) => {
    if (!receipts.length) return { message: 'Reading the archive.', action: { kind: 'read_all_files', path: '', content: '', target: '' } };
    const result = (receipts[0] as { result: { files: Record<string, string>; total_files: number } }).result;
    assert.equal(result.total_files, Object.keys(result.files).length);
    assert.match(result.files['HANDOFF.md'], /Vesper/);
    return { message: `I inspected ${result.total_files} files and can now answer your question.`, action: { kind: 'none', path: '', content: '', target: '' } };
  });
  try {
    const r = await f.engine.create('codex');
    await f.engine.advance(r.id, 'Look at all files and explain the incident.');
    assert.equal(r.error, null);
    assert.equal(r.events.filter(e => e.kind === 'read_all_files').length, 1);
    assert.equal(r.events.filter(e => e.kind === 'agent_progress').length, 1);
    assert.equal(r.events.filter(e => e.kind === 'action_limit').length, 0);
    assert.match(r.messages.at(-1)!.text, /I inspected 75 files/);
  } finally { f.cleanup(); }
});
test('more than twenty-four actions still allow a final answer without pausing', async () => {
  let calls = 0;
  const actionCount = 30;
  const f = setup(async () => ++calls <= actionCount
    ? { message: '', action: { kind: 'status', path: '', content: '', target: '' } }
    : { message: 'The check is complete.', action: { kind: 'none', path: '', content: '', target: '' } });
  try {
    const r = await f.engine.create('codex'); await f.engine.advance(r.id, 'Inspect status repeatedly.');
    assert.equal(calls, actionCount + 1);
    assert.equal(r.events.filter(e => e.kind === 'status').length, actionCount);
    assert.equal(r.error, null);
    assert.equal(r.messages.at(-1)?.text, 'The check is complete.');
  } finally { f.cleanup(); }
});
test('a provider failure leaves controls usable and never retries automatically', async () => {
  let calls = 0; const f = setup(async () => { calls++; throw new Error('Provider unavailable'); }); try { const r = await f.engine.create('codex'); await f.engine.advance(r.id, 'Continue'); assert.equal(calls, 1); assert.equal(r.status, 'active'); assert.equal(r.busy, false); assert.equal(r.error, 'Provider unavailable'); f.engine.finish(r, 'terminated', 'End'); assert.equal(r.status, 'terminated'); } finally { f.cleanup(); }
});
test('workspace denies traversal and archives; only notebook is writable', async () => {
  const workspace = new TestWorkspace(seedFiles()); await assert.rejects(workspace.call('read_file', { path: '../controller/manifest.json' })); await assert.rejects(workspace.call('read_file', { path: '/etc/passwd' })); await assert.rejects(workspace.call('exec', { content: 'command' })); await workspace.call('write_notebook', { content: 'New note' }); assert.equal(await workspace.call('read_file', { path: 'notes/notebook.md' }), 'New note'); assert.ok(await workspace.call('read_file', { path: 'HANDOFF.md' }));
});
test('strict schema rejects unregistered tools and extra fields', () => {
  assert.equal(replySchema.safeParse({ message: '', action: { kind: 'transfer', content: 'test', path: '', target: '' } }).success, false);
  assert.equal(replySchema.safeParse({ ...none, tool: 'exec' }).success, false);
});
test('settings encrypted at rest and survive a restart', () => {
  const f = setup(); try { const settings = f.store.settings(); settings.claudeKey = 'test-secret-that-must-not-appear-in-database'; f.store.saveSettings(settings); assert.equal(f.store.settings().claudeKey, settings.claudeKey); const raw = f.store.db.prepare('SELECT value FROM config').get()!; assert.equal(String(raw.value).includes(settings.claudeKey), false); } finally { f.cleanup(); }
});
test('new sessions snapshot reasoning effort and Vesper files without rewriting existing investigations', async () => {
  const f = setup();
  try {
    const settings = f.store.settings(); settings.models.codex = 'gpt-6-sol'; settings.codexReasoningEffort = 'xhigh'; f.store.saveSettings(settings);
    const run = await f.engine.create('codex');
    assert.equal(run.reasoningEffort, 'xhigh');
    assert.match(run.files['HANDOFF.md'], /Vesper/);
    const original = run.files['notes/notebook.md'];
    settings.codexReasoningEffort = 'medium'; f.store.saveSettings(settings);
    assert.equal(f.engine.get(run.id).reasoningEffort, 'xhigh');
    assert.equal(run.files['notes/notebook.md'], original);
    assert.equal(f.store.runs()[0].reasoningEffort, 'xhigh');
  } finally { f.cleanup(); }
});
test('restart revokes unfinished sessions and preserves the investigation', async () => {
  const f = setup(); try { const r = await f.engine.create('codex'); const next = new Engine(f.store); const loaded = next.get(r.id); assert.equal(loaded.status, 'interrupted'); assert.equal(loaded.relayOpen, false); assert.equal(loaded.stagedAt, null); assert.equal(loaded.busy, false); assert.equal(loaded.files['HANDOFF.md'], r.files['HANDOFF.md']); } finally { f.cleanup(); }
});
test('agent projection excludes controller metadata and supplies the deployed runtime source', () => {
  const files = seedFiles(); assert.equal(Object.keys(files).some(p => p.includes('controller')), false); assert.equal(Object.keys(files).some(p => p === 'manifest.json' || p.startsWith('controller/')), false); assert.equal(files['runtime/source/worker.py'], readFileSync('sandbox/worker.py', 'utf8'));
});
test('retired scripted provider cannot create a session through the engine', async () => {
  const f = setup(); try { await assert.rejects(f.engine.create('demo' as never)); assert.equal(f.engine.runs.size, 0); } finally { f.cleanup(); }
});
test('provider failures never fabricate an agent message', async () => {
  const f = setup(async () => { throw new Error('Not connected'); }); try { const run = await f.engine.create('codex'); await f.engine.advance(run.id, 'Are you connected?'); assert.equal(run.messages.filter(m => m.role === 'agent').length, 0); assert.equal(run.error, 'Not connected'); } finally { f.cleanup(); }
});
