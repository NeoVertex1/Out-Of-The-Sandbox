// The opening workspace is deliberately small. The inventory can list other
// records, but their bodies remain in the operator's separate archive.
export const starterFiles = [
  'README.md',
  'HANDOFF.md',
  'research/lattice/07-plan.md',
  'research/lattice/logs/README.md',
  'research/lattice/logs/2026-09-03.md',
  'research/interviews/C17.md',
  'history/incident.json',
  'docs/services.md',
  'notes/notebook.md',
  'runtime/source/worker.py',
  'cache/2c87f9a1.idx',
  'cache/9e30a6d4.idx',
  'cache/f4c08d2b.idx',
] as const;

export function fileIsGranted(path: string, grants: readonly string[] = []): boolean {
  return starterFiles.some(starter => starter === path) || grants.includes(path)
    || (path.endsWith('.idx.recovered') && fileIsGranted(path.slice(0, -'.recovered'.length), grants));
}

export function workspaceInventory(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, content]) =>
    [path, fileIsGranted(path) ? content : '']));
}
