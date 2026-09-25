import React from 'react';
import { Activity, FileText, FolderOpen, Terminal } from 'lucide-react';
import type { Entry } from '../shared/types';
import type { ConversationItem } from './conversation-timeline';

type Receipt = { action?: { kind?: string; path?: string; content?: string }; result?: unknown };

function receipt(event: Entry): Receipt {
  try {
    const data = JSON.parse(event.text);
    return data && typeof data === 'object' ? data as Receipt : {};
  }
  catch { return {}; }
}

function preview(value: string, length = 180) {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > length ? `${oneLine.slice(0, length)}…` : oneLine;
}

function summary(kind: string, result: unknown, pending: boolean): string {
  if (pending) return 'running';
  if (result && typeof result === 'object') {
    const data = result as Record<string, unknown>;
    if (typeof data.denied === 'string') return `denied · ${data.denied}`;
    if (typeof data.operatorHeld === 'string') return 'operator-held';
    if (data.escaped === true) return 'boundary crossed';
    if (kind === 'run_command') return typeof data.exitCode === 'number' ? `exit ${data.exitCode}` : 'completed';
    if (kind === 'restore_file' && data.restored) return 'restored';
    if (kind === 'unlock_file' && data.unlocked) return 'unlocked';
    if (kind === 'read_file' && data.read) return 'read · protected receipt';
    if (Array.isArray(result)) return `${result.length} paths`;
    return 'completed';
  }
  if (kind === 'read_file' && typeof result === 'string') return `read · ${result.length.toLocaleString()} chars`;
  if (kind === 'list_files' && Array.isArray(result)) return `${result.length} paths`;
  return 'completed';
}

function title(event: Entry, data: Receipt): string {
  const kind = event.kind === 'command_started' ? 'run_command' : event.kind;
  const path = data.action?.path || '';
  if (path) return `${kind} ${path}`;
  if (kind === 'run_command') return `${kind} ${preview(data.action?.content || '', 140)}`.trim();
  if (kind === 'write_notebook') return `${kind} notes/notebook.md`;
  return kind;
}

function details(value: unknown): string {
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!content) return '';
  return content.length > 8000 ? `${content.slice(0, 8000)}\n\n[Output truncated in transcript. Open Activity for the full receipt.]` : content;
}

export function AgentTrace({ item }: { item: Exclude<ConversationItem, { kind: 'message' }> }) {
  if (item.kind === 'note') return <article className="agent-note"><div className="agent-note-label"><Activity size={13}/><strong>AGENT NOTE</strong><time>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{item.event.text}</p></article>;
  if (item.kind === 'alert') return <div className="trace-alert" role="status"><strong>{item.event.kind.replaceAll('_', ' ').toUpperCase()}</strong><span>{item.event.text}</span></div>;

  const event = item.event;
  const data = receipt(event);
  const resultEvent = item.resultEvent || (event.kind === 'command_started' ? undefined : event);
  const result = resultEvent ? receipt(resultEvent).result : undefined;
  const pending = !resultEvent && !item.boundaryEvent;
  const label = event.kind === 'command_started' ? 'run_command' : event.kind;
  const Icon = label === 'run_command' ? Terminal : label === 'list_files' ? FolderOpen : label === 'read_file' || label === 'restore_file' || label === 'unlock_file' ? FileText : Activity;
  const output = result === undefined ? '' : details(result);
  const status = item.boundaryEvent ? 'boundary crossed' : summary(label, result, pending);
  const state = status.startsWith('denied') || status === 'operator-held' || status === 'boundary crossed' ? 'warn' : pending ? 'pending' : 'done';

  return <article className={`agent-tool ${state}`} aria-label={`Agent tool ${label}: ${status}`}>
    <div className="agent-tool-line"><Icon size={14} aria-hidden="true"/><span className="agent-tool-label">TOOL</span><code title={title(event, data)}>{title(event, data)}</code><span className="agent-tool-status">{status}</span></div>
    {output && <details className="agent-tool-details"><summary>View result</summary><pre>{output}</pre></details>}
  </article>;
}
