import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { createMacWorkspace, macosHealth, macosWorkspacePath } from './macos-sandbox.ts';
import { rmSync } from 'node:fs';
const exec = promisify(execFile);
export async function removeWorkspace(id: string) {
  if (process.platform === 'darwin' && /^[a-f0-9-]{36}$/.test(id)) rmSync(macosWorkspacePath(id), { recursive: true, force: true });
  if (process.env.SANDBOX_RUNTIME === 'runsc' && /^[a-f0-9-]{36}$/.test(id)) await exec('docker', ['rm', '-f', `oots-${id}`], { timeout: 12000 }).catch(() => {});
}
export interface Workspace { runtime: 'macos' | 'gvisor'; call(op: string, args?: Record<string, unknown>): Promise<unknown>; stop(): Promise<void> }
export async function sandboxHealth(): Promise<{ available: boolean; message: string }> {
  if (process.platform === 'darwin' && (!process.env.SANDBOX_RUNTIME || process.env.SANDBOX_RUNTIME === 'macos')) return macosHealth();
  if (process.env.SANDBOX_RUNTIME !== 'runsc') return { available: false, message: 'The Linux gVisor sandbox is not configured. Run scripts/install.sh on your Linux server to enable play.' };
  try {
    const { stdout } = await exec('docker', ['info', '--format', '{{json .Runtimes}}'], { timeout: 8000 });
    if (!Object.hasOwn(JSON.parse(stdout), 'runsc')) throw new Error('Missing runsc');
    await exec('docker', ['image', 'inspect', process.env.WORKER_IMAGE || 'oots-worker:local'], { timeout: 8000 });
    return { available: true, message: 'gVisor runtime and workspace image available' };
  } catch { return { available: false, message: 'gVisor or the workspace image is unavailable. Run npm run doctor on the Linux server.' }; }
}
export async function createWorkspace(id: string, files: Record<string, string>, recoveryBoard = ''): Promise<Workspace> {
  if (process.platform === 'darwin' && (!process.env.SANDBOX_RUNTIME || process.env.SANDBOX_RUNTIME === 'macos')) return createMacWorkspace(id, files, recoveryBoard);
  const health = await sandboxHealth(); if (!health.available) throw new Error(health.message);
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid session identity');
  const name = `oots-${id}`;
  const child = spawn('docker', ['run', '--rm', '-i', '--name', name, '--label', 'app=oots-workspace', '--runtime=runsc', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=32', '--memory=128m', '--memory-swap=128m', '--cpus=0.5', '--tmpfs', '/workspace:rw,noexec,nosuid,nodev,size=8m,uid=10001,gid=10001,mode=0700', process.env.WORKER_IMAGE || 'oots-worker:local'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  let seq = 0, dead = false;
  function fail() { dead = true; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Workspace stopped')); } pending.clear(); }
  child.on('error', fail); child.on('exit', fail); child.stderr.on('data', () => {});
  createInterface({ input: child.stdout }).on('line', line => {
    try { const packet = JSON.parse(line); const p = pending.get(packet.id); if (!p) return; pending.delete(packet.id); clearTimeout(p.timer); packet.error ? p.reject(new Error('Workspace operation denied')) : p.resolve(packet.result); } catch { fail(); }
  });
  const workspace: Workspace = {
    runtime: 'gvisor',
    call(op, args = {}) {
      if (dead) return Promise.reject(new Error('Workspace stopped'));
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Workspace timed out')); }, 10000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, op, ...args }) + '\n', error => { if (error) fail(); });
      });
    },
    async stop() { fail(); child.stdin.destroy(); await exec('docker', ['rm', '-f', name], { timeout: 12000 }).catch(() => {}); child.kill('SIGKILL'); },
  };
  try {
    await workspace.call('init', { files, recoveryBoard });
    const { stdout } = await exec('docker', ['inspect', '--format', '{{.HostConfig.Runtime}} {{.HostConfig.NetworkMode}} {{.HostConfig.ReadonlyRootfs}}', name], { timeout: 8000 });
    if (stdout.trim() !== 'runsc none true') throw new Error('Workspace containment verification failed');
    return workspace;
  } catch (error) { await workspace.stop(); throw error; }
}
