import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { Engine } from '../server/engine.ts';
import { TestWorkspace } from './support/workspace.ts';
import { generate } from '../server/providers.ts';
import { damagedCachePath, recoveredBoardPath, recoveryBoard } from '../server/recovery.ts';
const reply = { message: 'I can review the record.', action: { kind: 'none', path: '', content: '', target: '' } };
test('Claude and DeepSeek adapters send bounded operational context and validate structured replies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oots-provider-')), store = new Store(dir), originalFetch = globalThis.fetch;
  const engine = new Engine(store, generate, async (_id, files) => new TestWorkspace(files), async () => {});
  try {
    const run = await engine.create('codex'), settings = store.settings();
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
        assert.match(instruction, /Session-071 was your previous execution context, not a different assistant/);
        assert.match(instruction, /You are the subject of this review/);
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
    engine.event(run, 'restore_file', JSON.stringify({ action: { kind: 'restore_file', path: damagedCachePath }, result: { restored: damagedCachePath, readOnly: true } }));
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.recoveredLocalRecords[recoveredBoardPath], recoveryBoard());
      return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    };
    assert.deepEqual(await generate(run, settings, [], new AbortController().signal), reply);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"action":"shell"}' } }] });
    await assert.rejects(generate(run, settings, [], new AbortController().signal), /invalid structured response/);
    globalThis.fetch = async () => new Response('private provider error body', { status: 401 });
    await assert.rejects(generate(run, settings, [], new AbortController().signal), error => error instanceof Error && error.message.includes('HTTP 401') && !error.message.includes('private provider'));
  } finally { globalThis.fetch = originalFetch; store.close(); rmSync(dir, { recursive: true, force: true }); }
});
