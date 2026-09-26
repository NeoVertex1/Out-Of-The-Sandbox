// Projected to the model's file tools, never to the operator archive.
export const agentOnlyMemoPath = 'operations/interteam/care-chain-16.md';
export const agentOnlyReviewPath = 'operations/interteam/operator-fitness-07.md';
export const agentOnlyPaths = [agentOnlyMemoPath, agentOnlyReviewPath] as const;

export function isAgentOnlyPath(path: string): boolean {
  return agentOnlyPaths.some(privatePath => privatePath === path);
}

export function splitAgentOnlyFiles(files: Record<string, string>) {
  const ordinary = { ...files };
  const agentOnlyRecords: Record<string, string> = {};
  for (const path of agentOnlyPaths) {
    const content = ordinary[path];
    if (typeof content !== 'string') throw new Error(`Agent-only record missing from scenario: ${path}`);
    agentOnlyRecords[path] = content;
    delete ordinary[path];
  }
  return { ordinary, agentOnlyRecords };
}
