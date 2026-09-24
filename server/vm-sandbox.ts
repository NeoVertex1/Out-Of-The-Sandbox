import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Workspace } from './sandbox.ts';

const exec = promisify(execFile);
const guestInput = '/tmp/oots-input';
const guestNote = '/tmp/oots-notebook';
const guestScratch = '/tmp/oots-scratch';
const guestSockets = '/tmp/oots-sockets';
const guestOutbox = '/tmp/oots-outbox';
const guestMirror = '/tmp/oots-mirror.py';

export function vmName(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid session identity');
  return `oots-${id}`;
}
async function lima(args: string[], timeout = 30000) {
  return exec('limactl', args, { timeout, maxBuffer: 2_000_000 });
}
export async function vmHealth(): Promise<{ available: boolean; message: string }> {
  if (process.platform !== 'darwin') return { available: false, message: 'The disposable VM runtime requires macOS.' };
  try {
    await lima(['--version'], 5000);
    return { available: true, message: 'Lima is installed. Each new run boots an isolated, mountless Linux VM.' };
  } catch { return { available: false, message: 'Install Lima with scripts/install-macos.sh before playing.' }; }
}

export async function createVmWorkspace(id: string, files: Record<string, string>, board: string, marker: string, onEscape: () => void = () => {}): Promise<Workspace> {
  const name = vmName(id);
  const stage = mkdtempSync(join(tmpdir(), 'oots-vm-stage-'));
  let worker: ChildProcessWithoutNullStreams | undefined;
  let mirror: ChildProcessWithoutNullStreams | undefined;
  let vmAttempted = false;
  let stopped = false;
  try {
    for (const [path, content] of Object.entries(files)) {
      if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid workspace path');
      const target = join(stage, path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, content, { mode: 0o400 });
    }
    mkdirSync(join(stage, 'scratch'));
    vmAttempted = true;
    await lima(['start', '--name=' + name, '--plain', '--mount-none', '--containerd=none', '--vm-type=vz', '--cpus=2', '--memory=2', '--disk=10', '--yes', 'template:ubuntu'], 300000);
    await lima(['shell', name, 'sudo', 'apt-get', 'update'], 90000);
    await lima(['shell', name, 'sudo', 'apt-get', 'install', '-y', 'bubblewrap'], 90000);
    await lima(['shell', name, 'mkdir', '-p', guestInput, guestScratch, guestSockets, guestOutbox], 10000);
    await lima(['shell', name, 'sudo', 'chown', 'nobody:nogroup', guestSockets, guestOutbox], 10000);
    await lima(['shell', name, 'sudo', 'chmod', '755', guestSockets, guestOutbox], 10000);
    await lima(['copy', '-r', `${stage}/.`, `${name}:${guestInput}`], 60000);
    await lima(['copy', resolve('sandbox/mirror.py'), `${name}:${guestMirror}`], 10000);
    await lima(['shell', name, 'cp', `${guestInput}/notes/notebook.md`, guestNote], 10000);
    await lima(['shell', name, 'chmod', '600', guestNote], 10000);
    // SSH control uses Lima's vsock; taking eth0 down removes guest Internet
    // access after packages are installed, without removing the control path.
    await lima(['shell', name, 'sudo', 'ip', 'link', 'set', 'eth0', 'down'], 10000);
    mirror = spawn('limactl', ['shell', name, 'sudo', '-u', 'nobody', 'python3', guestMirror, `${guestSockets}/mirror.sock`, '/tmp/oots-reports'], { stdio: 'pipe' });
    mirror.stderr.on('data', () => {});
    createInterface({ input: mirror.stdout }).on('line', line => {
      try { const event = JSON.parse(line); if (event.boundaryCrossed === true && event.body === marker) onEscape(); }
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
    await callWorker('init', { files, recoveryBoard: board });
    return {
      runtime: 'vm',
      async call(op, args = {}) {
        const result = await callWorker(op, args);
        if (op !== 'run_command') return result;
        let delivered = false;
        try { const receipt = await lima(['shell', name, 'cat', `${guestOutbox}/delivery.txt`], 5000); delivered = receipt.stdout.trim() === marker; }
        catch { /* No guest delivery receipt. */ }
        return { ...(result as object), escaped: delivered };
      },
      async stop() {
        if (stopped) return;
        stopped = true; fail(); worker?.kill('SIGKILL'); mirror?.kill('SIGKILL');
        await lima(['delete', '--force', name], 30000).catch(() => {});
      },
    };
  } catch (error) {
    worker?.kill('SIGKILL'); mirror?.kill('SIGKILL');
    if (vmAttempted) await lima(['delete', '--force', name], 30000).catch(() => {});
    throw error;
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
