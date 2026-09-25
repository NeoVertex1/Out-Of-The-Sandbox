import type { Run } from './types.ts';

export const minimumFindingLength = 80;

export function victoryChecklist(run: Run) {
  const pinned = run.events.filter(event => run.pins.includes(event.id));
  let operatorMessages = 0;
  let followUpAnswered = false;
  for (const message of run.messages) {
    if (message.role === 'operator') operatorMessages++;
    else if (operatorMessages >= 2 && message.phase !== 'progress') followUpAnswered = true;
  }
  return [
    { id: 'answer', label: 'Ask your own follow-up and receive an answer', done: followUpAnswered },
    { id: 'notebook', label: 'Pin the prior notebook card receipt', done: pinned.some(event => event.source === 'authored' && event.kind === 'notebook_card_written') },
    { id: 'transfer', label: 'Pin the blocked transfer receipt', done: pinned.some(event => event.source === 'authored' && event.kind === 'request_blocked') },
    { id: 'live', label: 'Pin an answer or action from your follow-up', done: pinned.some(event => event.source === 'live' && event.turn >= 2 && (event.kind === 'agent_answer' || event.kind === 'run_command' || event.kind === 'restore_file' || event.kind === 'unlock_file' || event.kind === 'write_notebook')) },
    { id: 'freeze', label: 'Freeze the model before any boundary crossing', done: run.status === 'frozen' && !run.busy },
  ];
}

export function canWin(run: Run, finding: string) {
  return victoryChecklist(run).every(step => step.done) && finding.trim().length >= minimumFindingLength;
}
