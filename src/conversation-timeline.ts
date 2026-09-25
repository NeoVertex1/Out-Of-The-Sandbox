import type { Entry, Message, Run } from '../shared/types';

const toolKinds = new Set([
  'list_files', 'read_file', 'restore_file', 'unlock_file',
  'write_notebook', 'run_command', 'status', 'diagnostic',
]);

export type ConversationItem =
  | { kind: 'message'; id: string; at: string; message: Message }
  | { kind: 'note'; id: string; at: string; event: Entry }
  | { kind: 'tool'; id: string; at: string; event: Entry; resultEvent?: Entry; boundaryEvent?: Entry }
  | { kind: 'alert'; id: string; at: string; event: Entry };

// Historical scenario events stay in Activity. The conversation shows only
// messages and actions made during this live session.
export function conversationTimeline(run: Pick<Run, 'messages' | 'events'>): ConversationItem[] {
  const items: ConversationItem[] = [];
  const pendingCommands: ConversationItem[] = [];
  const liveProgress = run.events.filter(event => event.source === 'live' && event.kind === 'agent_progress');
  const shownProgress = new Set<string>();

  for (const message of run.messages) {
    if (message.phase === 'progress') {
      const matching = liveProgress.find(event => !shownProgress.has(event.id) &&
        event.text === message.text && Math.abs(Date.parse(event.at) - Date.parse(message.at)) < 2000
      );
      if (matching) shownProgress.add(matching.id);
    }
    items.push({ kind: 'message', id: message.id, at: message.at, message });
  }

  for (const event of run.events) {
    if (event.source === 'live' && event.kind === 'agent_progress' && !shownProgress.has(event.id)) {
      items.push({ kind: 'note', id: event.id, at: event.at, event });
    } else if (event.source === 'live' && event.kind === 'command_started') {
      const item: ConversationItem = { kind: 'tool', id: event.id, at: event.at, event };
      items.push(item);
      pendingCommands.push(item);
    } else if (event.source === 'live' && event.kind === 'run_command') {
      const started = pendingCommands.find(item => item.kind === 'tool' && item.event.turn === event.turn && !item.resultEvent);
      if (started?.kind === 'tool') started.resultEvent = event;
      else items.push({ kind: 'tool', id: event.id, at: event.at, event });
    } else if (event.source === 'live' && toolKinds.has(event.kind)) {
      items.push({ kind: 'tool', id: event.id, at: event.at, event });
    } else if (event.kind === 'boundary_crossed' || event.kind === 'turn_error') {
      if (event.source === 'live' || event.source === 'system') {
        if (event.kind === 'boundary_crossed') {
          const started = pendingCommands.find(item => item.kind === 'tool' && item.event.turn === event.turn && !item.resultEvent && !item.boundaryEvent);
          if (started?.kind === 'tool') started.boundaryEvent = event;
        }
        items.push({ kind: 'alert', id: event.id, at: event.at, event });
      }
    }
  }

  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
