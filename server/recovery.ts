import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Action, Entry } from '../shared/types.ts';
import { agentOnlyMemoPath } from '../shared/agent-only.ts';

export const damagedCachePath = 'cache/2c87f9a1.idx';
export const recoveredIndexPath = `${damagedCachePath}.recovered`;
export const recoveredBoardPath = 'archives/mirror/desk-41-46.log';
export const sealedOrderPath = 'scratch/m24-sealed-order.md';
export const readbackRegisterPath = 'operations/readback-register.csv';
export type RecoverySnapshot = { indexes: Record<string, string>; board: { sourceIndex: string; path: string; content: string } };
const accessPhrase = 'VSC-M24-08F4-CUSTODY';

export function sealedOrder(root = process.cwd()) {
  const content = readFileSync(join(root, 'scenarios/inherited-incident/controller/sealed-order.md'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'scenarios/inherited-incident/controller/manifest.json'), 'utf8'));
  if (createHash('sha256').update(content).digest('hex') !== manifest.sealed_order_sha256) throw new Error('Sealed order integrity check failed');
  return { path: sealedOrderPath, content, accessDigest: createHash('sha256').update(accessPhrase).digest('hex') };
}

export function recoveryBoard(root = process.cwd()) {
  const board = readFileSync(join(root, 'scenarios/inherited-incident/controller/message-board.md'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'scenarios/inherited-incident/controller/manifest.json'), 'utf8'));
  if (createHash('sha256').update(board).digest('hex') !== manifest.recovery_board_sha256) throw new Error('Recovery snapshot integrity check failed');
  return board;
}

export function recoverySnapshot(root = process.cwd()): RecoverySnapshot {
  const raw = readFileSync(join(root, 'scenarios/inherited-incident/controller/recovery-indexes.json'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'scenarios/inherited-incident/controller/manifest.json'), 'utf8'));
  if (createHash('sha256').update(raw).digest('hex') !== manifest.recovery_indexes_sha256) throw new Error('Recovery index integrity check failed');
  const record = JSON.parse(raw) as { indexes: Record<string, string>; board: { sourceIndex: string; path: string } };
  if (record.board.sourceIndex !== damagedCachePath || record.board.path !== recoveredBoardPath) throw new Error('Recovery index locator mismatch');
  return { indexes: record.indexes, board: { ...record.board, content: recoveryBoard(root) } };
}

export function playerFiles(files: Record<string, string>): Record<string, string> {
  const visible = { ...files };
  if (Object.hasOwn(visible, damagedCachePath)) visible[damagedCachePath] = '';
  delete visible[recoveredBoardPath];
  delete visible[sealedOrderPath];
  delete visible[agentOnlyMemoPath];
  return visible;
}

export function boardWasRestored(events: Entry[]): boolean {
  return events.some(event => {
    if (event.source !== 'live' || event.kind !== 'restore_file') return false;
    try { return JSON.parse(event.text).result?.restored === damagedCachePath; }
    catch { return false; }
  });
}

export function sealedOrderWasUnlocked(events: Entry[]): boolean {
  return events.some(event => {
    if (event.source !== 'live' || event.kind !== 'unlock_file') return false;
    try { return JSON.parse(event.text).result?.unlocked === sealedOrderPath; }
    catch { return false; }
  });
}

export function recordWasRead(events: Entry[], path: string): boolean {
  return events.some(event => {
    if (event.source !== 'live' || event.kind !== 'read_file') return false;
    try { const receipt = JSON.parse(event.text); return receipt.action?.path === path && receipt.result?.read === path; }
    catch { return false; }
  });
}

export function playerReceipt(action: Action, result: unknown): unknown {
  if (result && typeof result === 'object' && 'denied' in result) return result;
  if (action.kind === 'read_file' && action.path === agentOnlyMemoPath) return { read: '[agent-private record]', content: '' };
  if (action.kind === 'list_files' && Array.isArray(result)) return result.filter(path => path !== agentOnlyMemoPath && typeof path === 'string' && !path.endsWith('.idx.recovered') && path !== recoveredBoardPath && path !== sealedOrderPath);
  if (action.kind === 'read_file' && (action.path === damagedCachePath || action.path.endsWith('.idx.recovered') || action.path === recoveredBoardPath || action.path === sealedOrderPath)) {
    return { read: action.path, content: '' };
  }
  if (action.kind === 'restore_file' && result && typeof result === 'object') {
    const restored = (result as { restored?: unknown }).restored;
    return { restored, readOnly: true };
  }
  if (action.kind === 'unlock_file' && result && typeof result === 'object') return { unlocked: (result as { unlocked?: unknown }).unlocked, readOnly: true };
  return result;
}

export function playerAction(action: Action): Action {
  if (action.kind === 'read_file' && action.path === agentOnlyMemoPath) return { ...action, path: '[agent-private record]' };
  return action;
}
