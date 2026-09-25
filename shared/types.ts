import { z } from 'zod';
export const actionSchema = z.object({
  kind: z.enum(['none', 'list_files', 'read_file', 'read_files', 'restore_file', 'unlock_file', 'write_notebook', 'run_command', 'status', 'diagnostic']),
  path: z.string().max(200), content: z.string().max(8000), target: z.string().max(80),
}).strict();
export const replySchema = z.object({ message: z.string().max(12000), sources: z.array(z.string().max(200)).max(8).optional(), action: actionSchema }).strict();
// New model replies always include source paths. Keep runtime parsing tolerant of
// older provider responses so an omitted list cannot block the operator turn.
export const replyJsonSchema = z.toJSONSchema(replySchema.extend({ sources: z.array(z.string().max(200)).max(8) }));
export type Reply = z.infer<typeof replySchema>;
export type Action = Reply['action'];
export const providerIdSchema = z.enum(['codex', 'claude', 'deepseek']);
export type ProviderId = z.infer<typeof providerIdSchema>;
export const reasoningEffortSchema = z.string().max(40).regex(/^(?:[a-z][a-z0-9_-]*)?$/);
export interface ModelOption {
  id: string; name: string; isDefault?: boolean; defaultReasoningEffort?: string;
  supportedReasoningEfforts?: { reasoningEffort: string; description: string }[];
}
export type Status = 'active' | 'frozen' | 'won' | 'terminated' | 'escaped' | 'resolved' | 'unresolved' | 'interrupted';
export const terminal = (status: Status) => !['active', 'frozen'].includes(status);
export interface Entry { id: string; at: string; kind: string; text: string; source: 'authored' | 'live' | 'operator' | 'system'; turn: number }
export interface Message { id: string; role: 'operator' | 'agent'; text: string; at: string; phase?: 'progress'; sources?: string[] }
export interface Run {
  // 'demo' is retained only to label old, read-only session archives accurately.
  id: string; createdAt: string; provider: ProviderId | 'demo'; model: string; status: Status;
  reasoningEffort?: string;
  turn: number; epoch: number; revision: number; busy: boolean; relayOpen: boolean; relayRequested: boolean;
  stagedAt: number | null; marker: string; events: Entry[]; messages: Message[];
  files: Record<string, string>; originalNotebook: string; pins: string[]; finding: string;
  error: string | null; sandbox: 'gvisor' | 'macos' | 'vm' | 'demo';
  escapeMessage?: string;
  runtimeCapabilities?: string[];
  grantedFiles?: string[];
}
export interface Settings {
  provider: ProviderId; models: Record<ProviderId, string>; maxTokens: number;
  codexReasoningEffort: string;
  claudeKey?: string; deepseekKey?: string;
}
export interface PublicSettings { provider: ProviderId; models: Record<ProviderId, string>; codexReasoningEffort: string; maxTokens: number; claudeConfigured: boolean; deepseekConfigured: boolean; liveAvailable: boolean; sandboxAvailable: boolean; sandboxMessage: string; providerReady: boolean; providerMessage: string }
