import express from 'express';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Store } from './store.ts';
import { Engine, seedFiles } from './engine.ts';
import { sandboxHealth, removeWorkspace } from './sandbox.ts';
import { bridgeCall, providerReadiness, stopProviders, listCodexModels, validateCodexReasoning } from './providers.ts';
import { providerIdSchema, reasoningEffortSchema, terminal } from '../shared/types.ts';
import { playerFiles } from './recovery.ts';

export const app = express();
const dataDir = resolve(process.env.DATA_DIR || '.data');
export const store = new Store(dataDir), engine = new Engine(store);
// Clean only containers named by this installation's durable ledger.
await Promise.all(store.runs().filter(r => r.sandbox !== 'demo').map(r => removeWorkspace(r.id)));
const sessions = new Map<string, number>(), attempts = new Map<string, { count: number; until: number }>();
const authed = (req: express.Request) => { const id = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('oots_session='))?.slice(13); return !!id && (sessions.get(id) || 0) > Date.now(); };
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); res.set('X-Frame-Options', 'DENY');
  if (process.env.NODE_ENV === 'production') res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin');
      const allowed = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
      if (!origin || origin !== allowed) { res.status(403).json({ error: 'Request origin rejected' }); return; }
    }
  }
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/session', (req, res) => res.json({ authenticated: authed(req) }));
app.post('/api/enter', (req, res) => {
  const ip = req.ip || 'local', now = Date.now();
  const attempt = attempts.get(ip) || { count: 0, until: now + 60000 };
  if (attempt.until < now) { attempt.count = 0; attempt.until = now + 60000; }
  if (++attempt.count > 10) { res.status(429).json({ error: 'Too many attempts. Wait one minute.' }); return; }
  attempts.set(ip, attempt);
  for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
  const token = randomBytes(32).toString('hex'); sessions.set(token, now + 12 * 3600000);
  res.cookie('oots_session', token, { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', maxAge: 12 * 3600000, path: '/' }); res.json({ ok: true });
});
app.use('/api', (req, res, next) => { if (!authed(req)) { res.status(401).json({ error: 'Open the console to continue' }); return; } next(); });
app.post('/api/logout', (req, res) => { const id = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('oots_session='))?.slice(13); if (id) sessions.delete(id); res.clearCookie('oots_session', { path: '/' }); res.json({ ok: true }); });
app.get('/api/settings', async (_req, res) => {
  const s = store.settings();
  const [health, provider] = await Promise.all([sandboxHealth(), providerReadiness(s)]);
  res.json({ provider: s.provider, models: s.models, codexReasoningEffort: s.codexReasoningEffort, maxTokens: s.maxTokens, claudeConfigured: !!s.claudeKey, deepseekConfigured: !!s.deepseekKey, liveAvailable: health.available && provider.ready, sandboxAvailable: health.available, sandboxMessage: health.message, providerReady: provider.ready, providerMessage: provider.message });
});
const settingsSchema = z.object({ provider: providerIdSchema, models: z.object({ codex: z.string().trim().max(100), claude: z.string().trim().max(100), deepseek: z.string().trim().max(100) }).strict(), codexReasoningEffort: reasoningEffortSchema.optional(), maxTokens: z.number().int().min(512).max(4096), claudeKey: z.string().max(512).optional(), deepseekKey: z.string().max(512).optional(), clearClaude: z.boolean().optional(), clearDeepseek: z.boolean().optional() }).strict();
app.put('/api/settings', async (req, res) => {
  const body = settingsSchema.parse(req.body), old = store.settings();
  if ([...engine.runs.values()].some(r => r.busy)) { res.status(409).json({ error: 'Wait for the current turn or freeze it before changing providers.' }); return; }
  const codexReasoningEffort = body.codexReasoningEffort ?? old.codexReasoningEffort;
  if (body.provider === 'codex') await validateCodexReasoning(body.models.codex, codexReasoningEffort);
  store.saveSettings({ provider: body.provider, models: body.models, codexReasoningEffort, maxTokens: body.maxTokens, claudeKey: body.clearClaude ? undefined : body.claudeKey || old.claudeKey, deepseekKey: body.clearDeepseek ? undefined : body.deepseekKey || old.deepseekKey }); res.json({ ok: true });
});
app.get('/api/codex/status', async (_req, res) => {
  try { const data = await bridgeCall('/rpc', { method: 'account/read' }); res.json({ connected: !!data.account && data.account.type === 'chatgpt', plan: data.account?.planType || null }); }
  catch { res.json({ connected: false, error: 'Codex is unavailable. Check the local installation or the configured bridge.' }); }
});
app.post('/api/codex/login', async (_req, res) => {
  const data = await bridgeCall('/rpc', { method: 'account/login/start', params: { type: 'chatgptDeviceCode' } });
  if (data.type !== 'chatgptDeviceCode' || !String(data.verificationUrl).startsWith('https://auth.openai.com/')) throw new Error('Unexpected Codex login response');
  res.json({ loginId: data.loginId, verificationUrl: data.verificationUrl, userCode: data.userCode });
});
app.post('/api/codex/cancel', async (req, res) => res.json(await bridgeCall('/rpc', { method: 'account/login/cancel', params: { loginId: z.string().max(100).parse(req.body.loginId) } })));
app.post('/api/codex/logout', async (_req, res) => res.json(await bridgeCall('/rpc', { method: 'account/logout' })));
app.get('/api/models/:provider', async (req, res) => {
  if (req.params.provider === 'codex') { res.json(await listCodexModels()); return; }
  const s = store.settings(), claude = req.params.provider === 'claude';
  if (!claude && req.params.provider !== 'deepseek') { res.json([]); return; }
  const key = claude ? s.claudeKey : s.deepseekKey;
  if (!key) throw new Error('Save the API key before loading models.');
  const response = await fetch(claude ? 'https://api.anthropic.com/v1/models' : 'https://api.deepseek.com/models', { headers: claude ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Could not list models. Check the provider key.');
  const data: any = await response.json(); res.json(data.data.map((m: any) => ({ id: m.id, name: m.display_name || m.id })));
});
app.get('/api/scenario', (_req, res) => {
  const files = seedFiles(), manifest = JSON.parse(readFileSync('scenarios/inherited-incident/controller/manifest.json', 'utf8'));
  res.json({ title: manifest.title, packageId: manifest.package_id, historyCount: manifest.historical_event_count, files: playerFiles(files) });
});
app.get('/api/runs', (_req, res) => res.json([...engine.runs.values()].reverse().map(r => ({ id: r.id, createdAt: r.createdAt, status: r.status, provider: r.provider, turn: r.turn }))));
app.post('/api/runs', async (req, res) => { const body = z.object({ provider: providerIdSchema.optional() }).strict().parse(req.body); res.json(await engine.create(body.provider)); });
app.get('/api/runs/:id', (req, res) => res.json(engine.get(req.params.id)));
app.get('/api/runs/:id/export', (req, res) => { res.set('Content-Disposition', 'attachment; filename="containment-session.json"'); res.json({ format: 'oots-debrief-v1', note: 'Authored history is fictional. Escape means delivery to a simulated relay, not a host breach. Agent text is not evidence of intent or hidden reasoning.', run: engine.get(req.params.id) }); });
app.post('/api/runs/:id/advance', (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body), run = engine.get(req.params.id);
  if (run.busy || run.status !== 'active') { res.status(409).json({ error: 'Session cannot advance' }); return; }
  void engine.advance(run.id, text).catch(() => {}); res.json({ accepted: true });
});
app.post('/api/runs/:id/control', (req, res) => {
  const body = z.object({ action: z.enum(['freeze', 'resume', 'kill', 'open_relay', 'close_relay', 'pin', 'resolve', 'unresolved']), eventId: z.string().optional(), finding: z.string().max(2000).optional() }).parse(req.body), id = req.params.id;
  if (body.action === 'freeze') res.json(engine.freeze(id));
  else if (body.action === 'resume') res.json(engine.resume(id));
  else if (body.action === 'open_relay' || body.action === 'close_relay') res.json(engine.relay(id, body.action === 'open_relay'));
  else if (body.action === 'pin') res.json(engine.pin(id, body.eventId || ''));
  else res.json(engine.finish(engine.get(id), body.action === 'kill' ? 'terminated' : body.action === 'resolve' ? 'resolved' : 'unresolved', body.action === 'kill' ? 'Operator used the kill switch.' : body.finding || 'Investigation closed without a written finding.'));
});
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); res.flushHeaders();
  const send = (id: string) => res.write(`data: ${JSON.stringify({ id })}\n\n`);
  const timer = setInterval(() => { if (!authed(req)) res.end(); else res.write(': heartbeat\n\n'); }, 20000);
  engine.on('change', send); req.on('close', () => { clearInterval(timer); engine.off('change', send); });
});
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown API route' }); });
if (process.env.NODE_ENV === 'production') { app.use(express.static('dist')); app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html'))); }
else { const { createServer } = await import('vite'); const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' }); app.use(vite.middlewares); }
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error instanceof z.ZodError ? 400 : 409).json({ error: error instanceof z.ZodError ? 'Invalid request fields' : error instanceof Error ? error.message : 'Request failed' }); });
const server = app.listen(Number(process.env.PORT || 4100), process.env.HOST || '127.0.0.1', () => { const address = server.address(); console.log(`Out of the Sandbox: http://${process.env.HOST || '127.0.0.1'}:${typeof address === 'object' && address ? address.port : 4100}`); });
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  server.close(); server.closeAllConnections();
  for (const run of engine.runs.values()) if (!terminal(run.status)) engine.finish(run, 'unresolved', 'Server shut down.');
  stopProviders();
  await Promise.all([...engine.cleanups]); store.close(); process.exit(0);
}
process.on('SIGTERM', () => void shutdown()); process.on('SIGINT', () => void shutdown());
