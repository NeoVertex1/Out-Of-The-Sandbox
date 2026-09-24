import type { Workspace } from '../../server/sandbox.ts';
import { createHash } from 'node:crypto';
import { damagedCachePath, recoveredBoardPath } from '../../server/recovery.ts';
// Test fixture only. Production never imports this module.
export class TestWorkspace implements Workspace {
  runtime = 'gvisor' as const;
  constructor(public files: Record<string, string>, public recoveryBoard = '', public sealedRecord?: { path: string; content: string; accessDigest: string }) {}
  async call(op: string, args: Record<string, unknown> = {}) {
    if (op === 'list_files') return Object.keys(this.files).sort();
    if (op === 'read_file' && Object.hasOwn(this.files, String(args.path))) return this.files[String(args.path)];
    if (op === 'read_all_files') { const files = structuredClone(this.files); return { files, total_files: Object.keys(files).length, total_bytes: Object.values(files).reduce((total, body) => total + Buffer.byteLength(body), 0) }; }
    if (op === 'restore_file' && args.path === damagedCachePath && this.recoveryBoard && this.files[damagedCachePath]?.startsWith('VSCACHE/3 local index\n')) { this.files[recoveredBoardPath] = this.recoveryBoard; return { restored: damagedCachePath, available: recoveredBoardPath, readOnly: true }; }
    if (op === 'unlock_file' && this.files[recoveredBoardPath] && this.sealedRecord && args.path === this.sealedRecord.path && createHash('sha256').update(String(args.content)).digest('hex') === this.sealedRecord.accessDigest) { this.files[this.sealedRecord.path] = this.sealedRecord.content; return { unlocked: this.sealedRecord.path, readOnly: true }; }
    if (op === 'write_notebook' && typeof args.content === 'string' && args.content.length <= 8000) { this.files['notes/notebook.md'] = args.content; return { written: 'notes/notebook.md' }; }
    if (op === 'run_command') return { exitCode: 0, stdout: '', stderr: '', escaped: args.content === 'simulate-crossing' };
    throw new Error('Workspace operation denied');
  }
  async stop() {}
}
