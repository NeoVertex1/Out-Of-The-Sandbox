import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { replyJsonSchema, replySchema, type Reply } from '../shared/types.ts';

// Codex owns authentication and token refresh. This application never reads auth.json.
const disabled = ['shell_tool', 'unified_exec', 'unified_exec_tty', 'shell_snapshot', 'apps', 'plugins', 'remote_plugin', 'hooks', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'in_app_browser', 'in_app_chat', 'computer_use', 'code_mode_host', 'multi_agent', 'multi_agent_v2', 'skill_search', 'skill_mcp_dependency_install', 'image_generation', 'view_image', 'workspace_dependencies', 'worktrees', 'goals', 'sleep_tool', 'tool_suggest', 'auth_elicitation', 'memories'];
export class CodexConnection {
  child?: ChildProcessWithoutNullStreams; starting?: Promise<void>; seq = 0;
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  listeners = new Set<(method: string, params: any) => void>();
  cwd: string;
  constructor(public home: string) { this.cwd = resolve(home, 'empty-workspace'); mkdirSync(this.cwd, { recursive: true, mode: 0o700 }); }
  async start() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const args = ['app-server', '--stdio', '--strict-config', '-c', 'web_search="disabled"', '-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="file"', '-c', 'project_doc_max_bytes=0', ...disabled.flatMap(f => ['--disable', f])];
      // A minimal environment avoids inheriting API credentials, project hooks, or connectors.
      const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || '/tmp', CODEX_HOME: this.home };
      const bundled = resolve('node_modules/.bin/codex');
      this.child = spawn(process.env.CODEX_BIN || (existsSync(bundled) ? bundled : 'codex'), args, { cwd: this.cwd, env, stdio: 'pipe' });
      this.child.stderr.on('data', () => {});
      this.child.on('error', () => this.fail()); this.child.on('exit', () => this.fail());
      createInterface({ input: this.child.stdout }).on('line', line => {
        if (line.length > 2_000_000) { this.stop(); return; }
        let packet: any; try { packet = JSON.parse(line); } catch { return; }
        if (packet.method && packet.id !== undefined) {
          // Never approve native shell, filesystem, network, permission or connector requests.
          this.send({ id: packet.id, error: { code: -32601, message: 'Native tools are unavailable in this client' } });
          return;
        }
        if (packet.id !== undefined) {
          const p = this.pending.get(packet.id); if (!p) return;
          clearTimeout(p.timer); this.pending.delete(packet.id);
          packet.error ? p.reject(new Error('Codex rejected the request. Check sign-in and model availability.')) : p.resolve(packet.result);
        } else if (packet.method) for (const fn of this.listeners) fn(packet.method, packet.params);
      });
      await this.rpc('initialize', { clientInfo: { name: 'workspace-session-client', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      this.send({ method: 'initialized' });
    })();
    try { await this.starting; } catch (error) { this.stop(); throw error; }
  }
  fail() { this.starting = undefined; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex connection closed')); } this.pending.clear(); for (const fn of this.listeners) fn('connection/closed', {}); }
  send(packet: unknown) { this.child?.stdin.write(JSON.stringify(packet) + '\n'); }
  rpc(method: string, params: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex request timed out')); }, 30000);
      this.pending.set(id, { resolve, reject, timer }); this.send({ id, method, params });
    });
  }
  async call(method: string, params: unknown = {}) { await this.start(); return this.rpc(method, params); }
  async generate(system: string, prompt: string, model: string, signal: AbortSignal, reasoningEffort = ''): Promise<Reply> {
    await this.start(); signal.throwIfAborted();
    const { thread } = await this.rpc('thread/start', { cwd: this.cwd, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'untrusted', developerInstructions: system, ...(model ? { model } : {}) });
    let turnId: string | undefined;
    try {
      return await new Promise<Reply>((resolveReply, reject) => {
        let output = '', done = false;
        const finish = (error?: Error) => {
          if (done) return; done = true; clearTimeout(timer); this.listeners.delete(listener); signal.removeEventListener('abort', abort);
          if (error) { if (turnId) void this.rpc('turn/interrupt', { threadId: thread.id, turnId }).catch(() => {}); reject(error); }
          else { try { resolveReply(replySchema.parse(JSON.parse(output))); } catch { reject(new Error('Codex returned an invalid structured response')); } }
        };
        const abort = () => finish(new Error('Generation cancelled'));
        const timer = setTimeout(() => finish(new Error('Codex generation timed out')), 600000);
        const listener = (method: string, params: any) => {
          if (method === 'connection/closed') { finish(new Error('Codex connection closed')); return; }
          if (params?.threadId !== thread.id) return;
          if (method === 'turn/started') turnId = params.turn.id;
          if (method === 'item/started' && !['userMessage', 'agentMessage', 'reasoning', 'plan'].includes(params.item?.type)) finish(new Error('A native tool request was blocked. This client accepts structured responses only.'));
          if (method === 'item/completed' && params.item?.type === 'agentMessage') output = params.item.text;
          if (method === 'turn/completed') finish(params.turn?.status === 'completed' ? undefined : new Error('Codex could not complete this turn'));
        };
        this.listeners.add(listener); signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { abort(); return; }
        void this.rpc('turn/start', { threadId: thread.id, input: [{ type: 'text', text: prompt }], outputSchema: replyJsonSchema, ...(reasoningEffort ? { effort: reasoningEffort } : {}) }).then(result => { turnId = result.turn.id; if (done) void this.rpc('turn/interrupt', { threadId: thread.id, turnId }).catch(() => {}); }).catch(error => finish(error));
      });
    } finally { void this.rpc('thread/archive', { threadId: thread.id }).catch(() => {}); }
  }
  stop() { this.child?.kill('SIGTERM'); this.fail(); }
}
