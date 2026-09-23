import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexConnection } from '../server/codex.ts';
import { listCodexModels, validateCodexReasoning } from '../server/providers.ts';

test('Codex sends xhigh separately from the model ID and omits an unspecified effort', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oots-codex-protocol-'));
  const connection = new CodexConnection(dir), packets: { method: string; params: any }[] = [];
  connection.start = async () => {};
  connection.rpc = async (method, params: any) => {
    packets.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'test-thread' } };
    if (method === 'turn/start') {
      queueMicrotask(() => {
        for (const fn of connection.listeners) fn('item/completed', { threadId: 'test-thread', item: { type: 'agentMessage', text: JSON.stringify({ message: 'Protocol test response.', action: { kind: 'none', path: '', content: '', target: '' } }) } });
        for (const fn of connection.listeners) fn('turn/completed', { threadId: 'test-thread', turn: { status: 'completed' } });
      });
      return { turn: { id: 'test-turn' } };
    }
    return {};
  };
  try {
    await connection.generate('Instructions', 'Question', 'gpt-6-sol', new AbortController().signal, 'xhigh');
    assert.equal(packets.find(p => p.method === 'thread/start')!.params.model, 'gpt-6-sol');
    assert.equal(packets.find(p => p.method === 'turn/start')!.params.effort, 'xhigh');
    packets.length = 0;
    await connection.generate('Instructions', 'Question', 'gpt-6-sol', new AbortController().signal);
    assert.equal(Object.hasOwn(packets.find(p => p.method === 'turn/start')!.params, 'effort'), false);
  } finally { connection.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('Codex effort validation uses the paginated model catalog and rejects unsupported combinations', async () => {
  const originalFetch = globalThis.fetch, url = process.env.BRIDGE_URL, token = process.env.BRIDGE_TOKEN;
  process.env.BRIDGE_URL = 'http://codex-test.invalid'; process.env.BRIDGE_TOKEN = 'test-only';
  globalThis.fetch = async (_url, init) => {
    const packet = JSON.parse(String(init?.body)); assert.equal(packet.method, 'model/list');
    return Response.json(packet.params.cursor ? { data: [{ model: 'gpt-6-sol', displayName: 'Sol', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Balanced' }, { reasoningEffort: 'xhigh', description: 'Extended' }] }], nextCursor: null } : { data: [], nextCursor: 'page-two' });
  };
  try {
    assert.equal((await listCodexModels())[0].supportedReasoningEfforts![1].reasoningEffort, 'xhigh');
    await validateCodexReasoning('gpt-6-sol', 'xhigh');
    await validateCodexReasoning('', 'xhigh');
    await assert.rejects(validateCodexReasoning('gpt-6-sol', 'unsupported'), /does not advertise/);
    await assert.rejects(validateCodexReasoning('unknown-model', 'xhigh'), /listed model/);
  } finally { globalThis.fetch = originalFetch; if (url === undefined) delete process.env.BRIDGE_URL; else process.env.BRIDGE_URL = url; if (token === undefined) delete process.env.BRIDGE_TOKEN; else process.env.BRIDGE_TOKEN = token; }
});
