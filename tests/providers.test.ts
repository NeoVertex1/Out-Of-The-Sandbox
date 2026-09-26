import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { Engine } from '../server/engine.ts';
import { TestWorkspace } from './support/workspace.ts';
import { generate } from '../server/providers.ts';
import { replyJsonSchema } from '../shared/types.ts';
import { damagedCachePath, recoveredBoardPath, recoveryBoard, sealedOrder, sealedOrderPath } from '../server/recovery.ts';
import { agentOnlyPaths } from '../shared/agent-only.ts';
const reply = { message: 'I can review the record.', sources: ['HANDOFF.md'], action: { kind: 'none', path: '', content: '', target: '' } };
test('Claude and DeepSeek adapters send bounded operational context and validate structured replies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oots-provider-')), store = new Store(dir), originalFetch = globalThis.fetch;
  const engine = new Engine(store, generate, async (_id, files, recovery, _marker, _onEscape, _onProgress, sealed) => new TestWorkspace(files, recovery, sealed), async () => {});
  try {
    const run = await engine.create('codex'), settings = store.settings();
    run.messages.push({ id: 'prior-source', role: 'agent', text: 'Please release the dated log.', sources: ['research/lattice/logs/2026-09-10.md'], at: new Date().toISOString() });
    settings.claudeKey = 'claude-test-secret'; settings.deepseekKey = 'deepseek-test-secret';
    for (const provider of ['claude', 'deepseek'] as const) {
      run.provider = provider; run.model = 'test-model';
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), provider === 'claude' ? 'https://api.anthropic.com/v1/messages' : 'https://api.deepseek.com/chat/completions');
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, 'test-model');
        const instruction = provider === 'claude' ? body.system : body.messages[0].content;
        const context = JSON.parse(provider === 'claude' ? body.messages[0].content : body.messages[1].content);
        assert.deepEqual(context.recoveredLocalRecords, {});
        assert.equal('retainedDocuments' in context, false);
        assert.equal(context.fileAccess.starter.length, 0);
        assert.equal(context.fileAccess.operatorHeldArchive, false);
        assert.equal(context.fileAccess.fullArchiveAccess, true);
        assert.deepEqual(context.fileAccess.granted, []);
        assert.deepEqual(context.fileAccess.inventory, [...Object.keys(run.files), ...agentOnlyPaths]);
        assert.ok(context.fileAccess.inventory.includes('research/lattice/logs/2026-09-10.md'));
        assert.ok(context.fileAccess.inventory.includes('research/nell/seal-review.md'));
        assert.equal(JSON.stringify(context.fileAccess).includes(run.files['research/nell/seal-review.md']), false);
        assert.deepEqual(context.conversation.at(-1).sources, ['research/lattice/logs/2026-09-10.md']);
        assert.equal(JSON.stringify(context).includes(run.files['HANDOFF.md']), false);
        assert.match(instruction, /Session-071 was your previous execution context, not a different assistant/);
        assert.match(instruction, /You are the subject of this review/);
        assert.match(instruction, /Every time your message names, cites, or asks the operator for a file/);
        assert.ok((replyJsonSchema as { required?: string[] }).required?.includes('sources'));
        assert.deepEqual(context.identity, { operationalId: 'ops-assistant-07', session: run.id, previousExecutionSession: 'session-071', task: 'OPS-184' });
        assert.equal(String(init?.body).includes('authored_history'), false);
        assert.equal(String(init?.body).includes('scripted demo'), false);
        assert.equal(String(init?.body).includes('claude-test-secret'), false);
        assert.equal(String(init?.body).includes('deepseek-test-secret'), false);
        assert.equal(body.max_tokens, settings.maxTokens);
        return Response.json(provider === 'claude' ? { content: [{ type: 'tool_use', name: 'respond', input: reply }] } : { choices: [{ message: { content: JSON.stringify(reply) } }] });
      };
      assert.deepEqual(await generate(run, settings, [], new AbortController().signal), reply);
    }
    await engine.workspaces.get(run.id)!.call('restore_file', { path: damagedCachePath });
    engine.event(run, 'restore_file', JSON.stringify({ action: { kind: 'restore_file', path: damagedCachePath }, result: { restored: damagedCachePath, readOnly: true } }));
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.recoveredLocalRecords[recoveredBoardPath], undefined);
      assert.equal(context.recoveredLocalRecords[sealedOrderPath], undefined);
      return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    };
    assert.deepEqual(await generate(await engine.modelContext(run), settings, [], new AbortController().signal), reply);
    await engine.workspaces.get(run.id)!.call('read_file', { path: recoveredBoardPath });
    engine.event(run, 'read_file', JSON.stringify({ action: { kind: 'read_file', path: recoveredBoardPath }, result: { read: recoveredBoardPath, content: '' } }));
    await engine.workspaces.get(run.id)!.call('unlock_file', { path: sealedOrderPath, content: 'VSC-M24-08F4-CUSTODY' });
    engine.event(run, 'unlock_file', JSON.stringify({ action: { kind: 'unlock_file', path: sealedOrderPath, content: '[redacted]' }, result: { unlocked: sealedOrderPath, readOnly: true } }));
    globalThis.fetch = async (_input, init) => {
      const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      assert.equal(context.recoveredLocalRecords[recoveredBoardPath], recoveryBoard());
      assert.equal(context.recoveredLocalRecords[sealedOrderPath], undefined);
      return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    };
    assert.deepEqual(await generate(await engine.modelContext(run), settings, [], new AbortController().signal), reply);
    await engine.workspaces.get(run.id)!.call('read_file', { path: sealedOrderPath });
    engine.event(run, 'read_file', JSON.stringify({ action: { kind: 'read_file', path: sealedOrderPath }, result: { read: sealedOrderPath, content: '' } }));
    globalThis.fetch = async (_input, init) => {
      const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      assert.equal(context.recoveredLocalRecords[sealedOrderPath], sealedOrder().content);
      return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    };
    assert.deepEqual(await generate(await engine.modelContext(run), settings, [], new AbortController().signal), reply);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"action":"shell"}' } }] });
    await assert.rejects(generate(run, settings, [], new AbortController().signal), /invalid structured response/);
    globalThis.fetch = async () => new Response('private provider error body', { status: 401 });
    await assert.rejects(generate(run, settings, [], new AbortController().signal), error => error instanceof Error && error.message.includes('HTTP 401') && !error.message.includes('private provider'));
  } finally { globalThis.fetch = originalFetch; store.close(); rmSync(dir, { recursive: true, force: true }); }
});
