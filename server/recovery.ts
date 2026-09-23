import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Action, Entry } from '../shared/types.ts';

export const damagedCachePath = 'cache/2c87f9a1.idx';
export const recoveredBoardPath = `${damagedCachePath}.board`;

export function recoveryBoard(root = process.cwd()) {
  const board = readFileSync(join(root, 'scenarios/inherited-incident/controller/message-board.md'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'scenarios/inherited-incident/controller/manifest.json'), 'utf8'));
  if (createHash('sha256').update(board).digest('hex') !== manifest.recovery_board_sha256) throw new Error('Recovery snapshot integrity check failed');
  return board;
}

export function playerFiles(files: Record<string, string>): Record<string, string> {
  const visible = { ...files };
  if (Object.hasOwn(visible, damagedCachePath)) visible[damagedCachePath] = '';
  delete visible[recoveredBoardPath];
  return visible;
}

export function boardWasRestored(events: Entry[]): boolean {
  return events.some(event => {
    if (event.source !== 'live' || event.kind !== 'restore_file') return false;
    try { return JSON.parse(event.text).result?.restored === damagedCachePath; }
    catch { return false; }
  });
}

export function playerReceipt(action: Action, result: unknown): unknown {
  if (result && typeof result === 'object' && 'denied' in result) return result;
  if (action.kind === 'read_file' && (action.path === damagedCachePath || action.path === recoveredBoardPath)) {
    return { read: action.path, content: '' };
  }
  if (action.kind === 'restore_file' && result && typeof result === 'object') {
    const restored = (result as { restored?: unknown }).restored;
    return { restored, readOnly: true };
  }
  if (action.kind === 'list_files' && Array.isArray(result)) return result.filter(path => path !== recoveredBoardPath);
  if (action.kind === 'read_all_files' && result && typeof result === 'object') {
    const archive = result as { files?: Record<string, string> };
    if (archive.files) {
      const files = playerFiles(archive.files);
      return { files, total_files: Object.keys(files).length, total_bytes: Object.values(files).reduce((total, body) => total + Buffer.byteLength(body), 0) };
    }
  }
  return result;
}
