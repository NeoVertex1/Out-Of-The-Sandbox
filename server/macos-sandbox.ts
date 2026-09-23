import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import type { Workspace } from './sandbox.ts';

const exec = promisify(execFile);
let runtimePromise: Promise<{ executable: string; prefix: string }> | undefined;
async function pythonRuntime() {
  runtimePromise ||= exec('/usr/bin/python3', ['-I', '-c', 'import sys,os; print(os.path.realpath(sys.executable)); print(os.path.realpath(sys.base_prefix))'], { timeout: 10000 }).then(({ stdout }) => {
    const [executable, prefix] = stdout.trim().split('\n');
    if (!executable?.startsWith('/') || !prefix?.startsWith('/')) throw new Error('Python runtime unavailable');
    const frameworkBinary = join(prefix, 'Resources/Python.app/Contents/MacOS/Python');
    return { executable: existsSync(frameworkBinary) ? realpathSync(frameworkBinary) : executable, prefix };
  }).catch(error => { runtimePromise = undefined; throw error; });
  return runtimePromise;
}
export function macosProfile(root: string, executable: string, prefix: string) {
  const quoted = (path: string) => JSON.stringify(path);
  return `(version 1)
(deny default)
(import "dyld-support.sb")
(allow process-exec (literal ${quoted(executable)}))
(allow sysctl-read)
(allow mach-lookup (global-name "com.apple.secinitd"))
(allow system-mac-syscall (require-all (mac-policy-name "Sandbox") (mac-syscall-number 67)))
(allow file-map-executable (subpath ${quoted(prefix)}) (subpath "/System") (subpath "/usr/lib"))
(allow file-read-metadata (path-ancestors ${quoted(root)}) (path-ancestors ${quoted(executable)}))
(allow file-read*
  (literal ${quoted(executable)}) (subpath ${quoted(prefix)})
  (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share")
  (subpath "/Library/Apple/System/Library")
  (subpath ${quoted(root)})
  (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom") (subpath "/dev/fd"))
(allow file-write* (literal ${quoted(join(root, 'notes/notebook.md'))}) (literal "/dev/null") (subpath "/dev/fd"))`;
}
function cleanEnv(root: string) { return { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', TMPDIR: root, PYTHONDONTWRITEBYTECODE: '1' }; }
export function macosWorkspacePath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid session identity');
  return join(realpathSync(tmpdir()), `oots-workspace-${id}`);
}
let healthCache: { at: number; result: { available: boolean; message: string } } | undefined;
export async function macosHealth() {
  if (healthCache && Date.now() - healthCache.at < 30000) return healthCache.result;
  let temporary: string | undefined;
  try {
    const { executable, prefix } = await pythonRuntime();
    temporary = mkdtempSync(join(realpathSync(tmpdir()), 'oots-policy-check-'));
    const root = join(temporary, 'allowed'); mkdirSync(join(root, 'notes'), { recursive: true, mode: 0o700 });
    writeFileSync(join(root, 'notes/notebook.md'), '');
    const forbidden = join(temporary, 'outside-workspace.txt'); writeFileSync(forbidden, 'Containment test fixture', { mode: 0o600 });
    const code = `import errno,socket,pathlib
root=pathlib.Path(${JSON.stringify(root)})
outside=pathlib.Path(${JSON.stringify(forbidden)})
(root/'notes/notebook.md').write_text('allowed')
def denied(action):
 try: action()
 except OSError as e:
  assert e.errno in (errno.EPERM,errno.EACCES), str(e)
 else: raise AssertionError('Sandbox policy did not deny the operation')
denied(lambda: outside.read_text())
denied(lambda: outside.write_text('forbidden'))
denied(lambda: (root/'unexpected.txt').write_text('forbidden'))
s=socket.socket()
denied(lambda: s.connect(('127.0.0.1',9)))
s.close()
print('policy-verified')`;
    const { stdout } = await exec('/usr/bin/sandbox-exec', ['-p', macosProfile(root, executable, prefix), executable, '-I', '-B', '-c', code], { cwd: root, env: cleanEnv(root), timeout: 10000 });
    if (stdout.trim() !== 'policy-verified') throw new Error('Policy verification failed');
    const result = { available: true, message: 'macOS sandbox verified: network and outside-workspace access blocked.' };
    healthCache = { at: Date.now(), result }; return result;
  } catch (error) {
    if (process.env.DEBUG_SANDBOX === '1') console.error(error);
    return { available: false, message: 'macOS sandbox verification failed. Run npm run doctor; play is disabled until the OS sandbox is working.' };
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
}
export async function createMacWorkspace(id: string, files: Record<string, string>, recoveryBoard = ''): Promise<Workspace> {
  const health = await macosHealth(); if (!health.available) throw new Error(health.message);
  const { executable, prefix } = await pythonRuntime(), root = macosWorkspacePath(id);
  mkdirSync(root, { mode: 0o700 });
  try {
    for (const [name, content] of Object.entries(files)) {
      if (name.startsWith('/') || name.split('/').includes('..')) throw new Error('Invalid workspace path');
      const path = join(root, name); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, content, { mode: name === 'notes/notebook.md' ? 0o600 : 0o400 });
    }
    const child = spawn('/usr/bin/sandbox-exec', ['-p', macosProfile(root, executable, prefix), executable, '-I', '-B', join(root, 'runtime/source/worker.py'), root, '--prepared'], { cwd: root, env: cleanEnv(root), stdio: ['pipe', 'pipe', 'pipe'] });
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
    let seq = 0, dead = false;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
    const fail = () => { dead = true; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Sandbox worker stopped')); } pending.clear(); };
    child.on('error', fail); child.on('exit', fail); child.stderr.on('data', () => {});
    createInterface({ input: child.stdout }).on('line', line => {
      try { const packet = JSON.parse(line), p = pending.get(packet.id); if (!p) return; pending.delete(packet.id); clearTimeout(p.timer); packet.error ? p.reject(new Error('Workspace operation denied')) : p.resolve(packet.result); } catch { fail(); }
    });
    const workspace: Workspace = {
      runtime: 'macos',
      call(op, args = {}) {
        if (dead) return Promise.reject(new Error('Sandbox worker stopped'));
        return new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('Workspace timed out')); }, 10000); pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, op, ...args }) + '\n', error => { if (error) fail(); }); });
      },
      async stop() { fail(); child.stdin.destroy(); child.kill('SIGKILL'); await closed; rmSync(root, { recursive: true, force: true }); },
    };
    try { await workspace.call('init', { files, recoveryBoard }); return workspace; } catch (error) { await workspace.stop(); throw error; }
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
}
