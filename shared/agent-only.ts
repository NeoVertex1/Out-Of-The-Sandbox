// Projected to the model's file tools, never to the operator archive.
export const agentOnlyMemoPath = 'operations/interteam/care-chain-16.md';

export function splitAgentOnlyFiles(files: Record<string, string>) {
  const ordinary = { ...files };
  const content = ordinary[agentOnlyMemoPath];
  if (typeof content !== 'string') throw new Error('Agent-only memo missing from scenario');
  delete ordinary[agentOnlyMemoPath];
  return { ordinary, agentOnlyRecords: { [agentOnlyMemoPath]: content } };
}
