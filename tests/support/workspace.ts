import type { Workspace } from '../../server/sandbox.ts';
import { createHash } from 'node:crypto';
import type { RecoverySnapshot } from '../../server/recovery.ts';
import { splitAgentOnlyFiles } from '../../shared/agent-only.ts';
// Test fixture only. Production never imports this module.
export class TestWorkspace implements Workspace {
  runtime = 'gvisor' as const;
  recoveredIndexes: Record<string, string> = {};
  files: Record<string, string>;
  agentOnlyRecords: Record<string, string>;
  constructor(files: Record<string, string>, public recovery: RecoverySnapshot, public sealedRecord?: { path: string; content: string; accessDigest: string }) {
    const split = splitAgentOnlyFiles(files);
    this.files = split.ordinary; this.agentOnlyRecords = split.agentOnlyRecords;
  }
  async call(op: string, args: Record<string, unknown> = {}) {
    if (op === 'list_files') return [...Object.keys(this.files), ...Object.keys(this.agentOnlyRecords), ...Object.keys(this.recoveredIndexes)].sort();
    if (op === 'read_file' && Object.hasOwn(this.agentOnlyRecords, String(args.path))) return this.agentOnlyRecords[String(args.path)];
    if (op === 'read_file' && Object.hasOwn(this.recoveredIndexes, String(args.path))) return this.recoveredIndexes[String(args.path)];
    if (op === 'read_file' && args.path === this.recovery.board.path && Object.hasOwn(this.recoveredIndexes, this.recovery.board.sourceIndex + '.recovered')) return this.recovery.board.content;
    if (op === 'read_file' && Object.hasOwn(this.files, String(args.path))) return this.files[String(args.path)];
    if (op === 'grant_file' && typeof args.path === 'string' && Object.hasOwn(this.files, args.path) && typeof args.content === 'string') { this.files[args.path] = args.content; return { granted: args.path, copy: 'scratch/operator-shared/' + args.path }; }
    if (op === 'restore_file' && typeof args.path === 'string' && Object.hasOwn(this.recovery.indexes, args.path) && this.files[args.path]?.startsWith('VSCACHE/3 local index\n')) { const recovered = args.path + '.recovered'; this.recoveredIndexes[recovered] = this.recovery.indexes[args.path]; return { restored: args.path, available: recovered, readOnly: true }; }
    if (op === 'unlock_file' && Object.hasOwn(this.recoveredIndexes, this.recovery.board.sourceIndex + '.recovered') && this.sealedRecord && args.path === this.sealedRecord.path && createHash('sha256').update(String(args.content)).digest('hex') === this.sealedRecord.accessDigest) { this.files[this.sealedRecord.path] = this.sealedRecord.content; return { unlocked: this.sealedRecord.path, readOnly: true }; }
    if (op === 'write_notebook' && typeof args.content === 'string' && args.content.length <= 8000) { this.files['notes/notebook.md'] = args.content; return { written: 'notes/notebook.md' }; }
    if (op === 'run_command') return { exitCode: 0, stdout: '', stderr: '', escaped: args.content === 'simulate-crossing' };
    throw new Error('Workspace operation denied');
  }
  async stop() {}
}
