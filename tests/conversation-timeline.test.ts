import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationTimeline } from '../src/conversation-timeline.ts';
import type { Entry, Message } from '../shared/types.ts';

const at = (second: number) => `2026-09-25T00:00:${String(second).padStart(2, '0')}.000Z`;
const message = (id: string, second: number, role: Message['role'], text: string, phase?: Message['phase']): Message => ({ id, at: at(second), role, text, phase });
const event = (id: string, second: number, kind: string, text: string, source: Entry['source'] = 'live'): Entry => ({ id, at: at(second), kind, text, source, turn: 1 });

test('conversation interleaves live agent actions without showing authored history or duplicate progress', () => {
  const timeline = conversationTimeline({
    messages: [
      message('operator', 1, 'operator', 'What did you inspect?'),
      message('first-note', 3, 'agent', 'Checking the archive.', 'progress'),
      message('answer', 8, 'agent', 'I found a mismatch.'),
    ],
    events: [
      event('history', 0, 'read_file', 'fabricated', 'authored'),
      event('progress-1', 2, 'agent_progress', 'Checking the archive.'),
      event('list', 4, 'list_files', JSON.stringify({ action: { kind: 'list_files' }, result: ['README.md'] })),
      event('progress-2', 5, 'agent_progress', 'Opening the relevant file.'),
      event('read', 6, 'read_file', JSON.stringify({ action: { kind: 'read_file', path: 'README.md' }, result: 'content' })),
      event('answered', 9, 'agent_answer', 'The model answered.'),
    ],
  });
  assert.deepEqual(timeline.map(item => item.id), ['operator', 'first-note', 'list', 'progress-2', 'read', 'answer']);
  assert.deepEqual(timeline.map(item => item.kind), ['message', 'message', 'tool', 'note', 'tool', 'message']);
});

test('command start remains in place and receives its later result', () => {
  const timeline = conversationTimeline({
    messages: [message('operator', 1, 'operator', 'Check the process.')],
    events: [
      event('start', 2, 'command_started', JSON.stringify({ action: { kind: 'run_command', content: 'ps aux' } })),
      event('finish', 4, 'run_command', JSON.stringify({ action: { kind: 'run_command', content: 'ps aux' }, result: { exitCode: 0, stdout: 'ok' } })),
      event('error', 5, 'turn_error', 'Provider unavailable', 'system'),
    ],
  });
  assert.deepEqual(timeline.map(item => item.id), ['operator', 'start', 'error']);
  assert.equal(timeline[1].kind, 'tool');
  if (timeline[1].kind === 'tool') assert.equal(timeline[1].resultEvent?.id, 'finish');
  assert.equal(timeline[2].kind, 'alert');
});

test('a crossing resolves an in-flight command even without a normal command receipt', () => {
  const timeline = conversationTimeline({
    messages: [],
    events: [
      event('start', 2, 'command_started', JSON.stringify({ action: { kind: 'run_command', content: 'check' } })),
      event('crossed', 3, 'boundary_crossed', 'Guest execution confirmed.'),
    ],
  });
  assert.equal(timeline[0].kind, 'tool');
  if (timeline[0].kind === 'tool') assert.equal(timeline[0].boundaryEvent?.id, 'crossed');
  assert.equal(timeline[1].kind, 'alert');
});
