import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { CodexConnection } from './codex.ts';
import { z } from 'zod';
import { reasoningEffortSchema } from '../shared/types.ts';
const token = process.env.BRIDGE_TOKEN;
if (!token || token.length < 32) throw new Error('BRIDGE_TOKEN must contain at least 32 characters');
const codex = new CodexConnection(resolve(process.env.CODEX_AUTH_DIR || '.data/codex'));
const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  const value = req.get('authorization')?.replace(/^Bearer /, '') || '';
  if (value.length !== token.length || !timingSafeEqual(Buffer.from(value), Buffer.from(token))) { res.sendStatus(401); return; } next();
});
app.post('/rpc', async (req, res) => {
  const method = req.body?.method;
  const allowed = ['account/read', 'account/login/start', 'account/login/cancel', 'account/logout', 'model/list'];
  if (!allowed.includes(method)) { res.sendStatus(400); return; }
  const params = method === 'account/login/start' ? { type: 'chatgptDeviceCode' } : method === 'account/login/cancel' ? { loginId: z.string().max(100).parse(req.body.params?.loginId) } : method === 'model/list' ? z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(1000).optional() }).parse(req.body.params || {}) : {};
  try { res.json(await codex.call(method, params)); } catch { res.status(502).json({ error: 'Codex is unavailable. Check the bridge logs and sign-in.' }); }
});
app.post('/generate', async (req, res) => {
  const body = z.object({ system: z.string().max(32000), prompt: z.string().max(180000), model: z.string().max(100), reasoningEffort: reasoningEffortSchema.default('') }).parse(req.body);
  const abort = new AbortController(); res.on('close', () => abort.abort());
  try { res.json(await codex.generate(body.system, body.prompt, body.model, abort.signal, body.reasoningEffort)); } catch { if (!res.destroyed) res.status(502).json({ error: 'Codex generation failed. Check your sign-in, usage limits, and selected model.' }); }
});
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(400).json({ error: 'Invalid bridge request' }); });
app.listen(Number(process.env.BRIDGE_PORT || 4101), process.env.BRIDGE_HOST || '127.0.0.1');
process.on('SIGTERM', () => { codex.stop(); process.exit(0); });
