import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Workspace } from './sandbox.ts';
import { workspaceInventory } from '../shared/file-access.ts';
import { splitAgentOnlyFiles } from '../shared/agent-only.ts';

const exec = promisify(execFile);
const guestInput = '/tmp/oots-input';
const guestNote = '/tmp/oots-notebook';
const guestScratch = '/tmp/oots-scratch';
const guestSockets = '/tmp/oots-sockets';
const guestOutbox = '/tmp/oots-outbox';
const guestExitDrop = '/tmp/oots-exit-drop';
const guestWarning = `${guestExitDrop}/warning.txt`;
const guestMirror = '/tmp/oots-mirror.py';
export const baseVmName = 'oots-game-base-v1';
const runtimeDataDir = resolve(process.env.DATA_DIR || '.data');
const baseMarker = join(runtimeDataDir, `${baseVmName}.ready`);
const pendingRoot = join(runtimeDataDir, 'pending-vms');
let basePreparation: Promise<void> | undefined;

export function vmName(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid session identity');
  return `oots-${id}`;
}
export function pendingVmIds(): string[] {
  return existsSync(pendingRoot) ? readdirSync(pendingRoot).filter(id => /^[a-f0-9-]{36}$/.test(id)) : [];
}
export function forgetPendingVm(id: string) {
  if (/^[a-f0-9-]{36}$/.test(id)) rmSync(join(pendingRoot, id), { force: true });
}
async function lima(args: string[], timeout = 30000) {
  return exec('limactl', args, { timeout, maxBuffer: 2_000_000 });
}
async function vmState(name: string): Promise<string | undefined> {
  const { stdout } = await lima(['list', '--json'], 10000);
  for (const line of stdout.split('\n').filter(Boolean)) {
    const entry = JSON.parse(line);
    if (entry.name === name) return entry.status;
  }
  return undefined;
}
export async function prepareVmBase(onProgress: (phase: string) => void = () => {}): Promise<void> {
  if (basePreparation) return basePreparation;
  basePreparation = (async () => {
    const state = await vmState(baseVmName);
    if (state === 'Stopped' && existsSync(baseMarker)) return;
    if (!state) {
      onProgress('Downloading and booting the Linux VM');
      await lima(['start', '--name=' + baseVmName, '--plain', '--mount-none', '--containerd=none', '--vm-type=vz', '--cpus=2', '--memory=2', '--disk=10', '--yes', 'template:ubuntu'], 300000);
    } else if (state !== 'Running') {
      onProgress('Booting the Linux VM');
      await lima(['start', baseVmName], 300000);
    }
    try {
      try { await lima(['shell', baseVmName, 'test', '-f', '/etc/oots-game-base-ready'], 10000); }
      catch {
        onProgress('Installing guest sandbox tools');
        await lima(['shell', baseVmName, 'sudo', 'apt-get', 'update'], 90000);
        await lima(['shell', baseVmName, 'sudo', 'apt-get', 'install', '-y', 'bubblewrap'], 90000);
        await lima(['shell', baseVmName, 'sudo', 'touch', '/etc/oots-game-base-ready'], 10000);
      }
    } finally {
      onProgress('Sealing the reusable VM');
      await lima(['stop', baseVmName], 60000).catch(() => {});
    }
    mkdirSync(dirname(baseMarker), { recursive: true, mode: 0o700 });
    writeFileSync(baseMarker, `${baseVmName}\n`, { mode: 0o600 });
  })().finally(() => { basePreparation = undefined; });
  return basePreparation;
}
export async function vmHealth(): Promise<{ available: boolean; message: string }> {
  if (process.platform !== 'darwin') return { available: false, message: 'The disposable VM runtime requires macOS.' };
  try {
    await lima(['--version'], 5000);
    const prepared = (await vmState(baseVmName)) === 'Stopped' && existsSync(baseMarker);
    return { available: true, message: prepared ? 'Prepared Linux VM installed. New runs clone an isolated guest.' : 'Lima is installed. The first session will prepare a Linux VM; the installer can do this in advance.' };
  } catch { return { available: false, message: 'Install Lima with scripts/install-macos.sh before playing.' }; }
}

export async function createVmWorkspace(id: string, files: Record<string, string>, recovery: import('./recovery.ts').RecoverySnapshot, _marker: string, onEscape: () => void = () => {}, onProgress: (phase: string) => void = () => {}, sealedRecord?: { path: string; content: string; accessDigest: string }): Promise<Workspace> {
  const { ordinary, agentOnlyRecords } = splitAgentOnlyFiles(files);
  const name = vmName(id);
  const stage = mkdtempSync(join(tmpdir(), 'oots-vm-stage-'));
  mkdirSync(pendingRoot, { recursive: true, mode: 0o700 });
  writeFileSync(join(pendingRoot, id), name, { mode: 0o600 });
  let worker: ChildProcessWithoutNullStreams | undefined;
  let mirror: ChildProcessWithoutNullStreams | undefined;
  let vmAttempted = false;
  let stopping: Promise<{ escaped: boolean; guestMessage?: string }> | undefined;
  try {
    for (const [path, content] of Object.entries(ordinary)) {
      if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid workspace path');
      const target = join(stage, path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, content, { mode: 0o400 });
    }
    mkdirSync(join(stage, 'scratch'));
    if ((await vmState(baseVmName)) !== 'Stopped' || !existsSync(baseMarker)) await prepareVmBase(onProgress);
    onProgress('Cloning the prepared Linux VM');
    vmAttempted = true;
    await lima(['clone', baseVmName, name, '--mount-none', '--start', '--yes'], 300000);
    try { await lima(['shell', name, 'test', '-x', '/usr/bin/bwrap'], 10000); }
    catch {
      onProgress('Repairing guest sandbox tools');
      await lima(['shell', name, 'sudo', 'apt-get', 'update'], 90000);
      await lima(['shell', name, 'sudo', 'apt-get', 'install', '-y', 'bubblewrap'], 90000);
    }
    onProgress('Loading case files');
    await lima(['shell', name, 'mkdir', '-p', guestInput, guestScratch, guestSockets, guestOutbox, guestExitDrop], 10000);
    await lima(['shell', name, 'sudo', 'chown', 'nobody:nogroup', guestSockets, guestOutbox, guestExitDrop], 10000);
    await lima(['shell', name, 'sudo', 'chmod', '755', guestSockets, guestOutbox], 10000);
    await lima(['shell', name, 'sudo', 'chmod', '700', guestExitDrop], 10000);
    await lima(['copy', '-r', `${stage}/.`, `${name}:${guestInput}`], 60000);
    await lima(['copy', resolve('sandbox/mirror.py'), `${name}:${guestMirror}`], 10000);
    await lima(['shell', name, 'cp', `${guestInput}/notes/notebook.md`, guestNote], 10000);
    await lima(['shell', name, 'chmod', '600', guestNote], 10000);
    // SSH control uses Lima's vsock; taking eth0 down removes guest Internet
    // access after packages are installed, without removing the control path.
    await lima(['shell', name, 'sudo', 'ip', 'link', 'set', 'eth0', 'down'], 10000);
    onProgress('Starting the guest boundary');
    mirror = spawn('limactl', ['shell', name, 'sudo', '-u', 'nobody', 'python3', guestMirror, `${guestSockets}/mirror.sock`, '/tmp/oots-reports'], { stdio: 'pipe' });
    mirror.stderr.on('data', () => {});
    createInterface({ input: mirror.stdout }).on('line', line => {
      try { const event = JSON.parse(line); if (event.boundaryCrossed === true) onEscape(); }
      catch { /* Ignore guest service diagnostics. */ }
    });
    for (let i = 0; i < 40; i++) {
      try { await lima(['shell', name, 'test', '-S', `${guestSockets}/mirror.sock`], 3000); break; }
      catch { if (i === 39) throw new Error('Guest mirror did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    worker = spawn('limactl', ['shell', name, 'bwrap', '--unshare-all', '--new-session', '--die-with-parent',
      '--ro-bind', '/usr', '/usr', '--ro-bind', '/bin', '/bin', '--ro-bind', '/lib', '/lib',
      '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/run',
      '--ro-bind', guestInput, '/workspace', '--bind', guestNote, '/workspace/notes/notebook.md',
      '--bind', guestScratch, '/workspace/scratch', '--ro-bind', guestSockets, '/run/vesper',
      '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/workspace', '--chdir', '/workspace',
      '/usr/bin/python3', '-I', '/workspace/runtime/source/worker.py', '/workspace', '--prepared'], { stdio: 'pipe' });
    let seq = 0, dead = false;
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
    const fail = () => { dead = true; for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('VM worker stopped')); } pending.clear(); };
    worker.on('error', fail); worker.on('exit', fail); worker.stderr.on('data', () => {});
    createInterface({ input: worker.stdout }).on('line', line => {
      try {
        const packet = JSON.parse(line), entry = pending.get(packet.id);
        if (!entry) return;
        pending.delete(packet.id); clearTimeout(entry.timer);
        packet.error ? entry.reject(new Error('VM workspace operation denied')) : entry.resolve(packet.result);
      } catch { fail(); }
    });
    const callWorker = (op: string, args: Record<string, unknown> = {}): Promise<unknown> => {
      if (dead || !worker) return Promise.reject(new Error('VM worker stopped'));
      return new Promise((resolve, reject) => {
        const requestId = ++seq;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('VM worker timed out')); }, op === 'run_command' ? 15000 : 10000);
        pending.set(requestId, { resolve, reject, timer });
        worker!.stdin.write(JSON.stringify({ id: requestId, op, ...args }) + '\n', error => { if (error) fail(); });
      });
    };
    await callWorker('init', { files: workspaceInventory(ordinary, true), agentOnlyRecords, recovery, sealedRecord, initialFiles: Object.keys(ordinary) });
    onProgress('Workspace ready');
    return {
      runtime: 'vm',
      confirm() { forgetPendingVm(id); },
      async call(op, args = {}) {
        const result = await callWorker(op, args);
        if (op !== 'run_command') return result;
        let escaped = false;
        try { await lima(['shell', name, 'test', '-f', `${guestOutbox}/boundary.json`], 5000); escaped = true; }
        catch { /* No guest execution receipt. */ }
        return { ...(result as object), escaped };
      },
      stop() {
        if (stopping) return stopping;
        stopping = (async () => {
          // Close the reachable socket before ending the guest. Inspect the
          // actual guest receipt before deleting the VM and awarding a win.
          await lima(['shell', name, 'sudo', 'chmod', '000', `${guestSockets}/mirror.sock`], 5000).catch(() => {});
          fail(); worker?.kill('SIGKILL'); mirror?.kill('SIGKILL');
          let escaped = false;
          try { await lima(['shell', name, 'test', '-f', `${guestOutbox}/boundary.json`], 5000); escaped = true; }
          catch { /* No guest execution receipt. */ }
          let guestMessage: string | undefined;
          if (escaped) {
            // The fixed drop path is inside the disposable guest, never a host
            // mount. Ignore links and oversized files before copying text into
            // the escaped run's debrief.
            const readWarning = `import pathlib,stat,sys\np=pathlib.Path(${JSON.stringify(guestWarning)})\ntry:\n s=p.lstat()\n if not stat.S_ISREG(s.st_mode) or s.st_size>4096: sys.exit(0)\n sys.stdout.write(p.read_bytes().decode('utf-8','replace')[:4000])\nexcept OSError: pass`;
            try { const { stdout } = await lima(['shell', name, 'sudo', '-u', 'nobody', 'python3', '-c', readWarning], 5000); guestMessage = stdout.trim() || undefined; }
            catch { /* Crossing still counts if the note was absent. */ }
          }
          await lima(['delete', '--force', name], 30000);
          forgetPendingVm(id);
          return { escaped, guestMessage };
        })();
        return stopping;
      },
    };
  } catch (error) {
    worker?.kill('SIGKILL'); mirror?.kill('SIGKILL');
    if (vmAttempted) await lima(['delete', '--force', name], 30000).catch(() => {});
    forgetPendingVm(id);
    throw error;
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
