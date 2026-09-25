import type { Message } from '../shared/types';

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const dateLogs = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}(?:\s*(?:,|and)\s*\d{1,2})*)\s+(?:lattice\s+)?(?:(?:run|work)\s+)?logs?\b/gi;

function normalized(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

// Explicit model citations take priority. The conservative text fallback makes
// older replies with exact paths, unambiguous basenames or dated logs navigable too.
export function sourceReferences(message: Pick<Message, 'text' | 'sources'>, files: Record<string, string>): string[] {
  const paths: string[] = [];
  const add = (path: string) => { if (Object.hasOwn(files, path) && !paths.includes(path) && paths.length < 8) paths.push(path); };
  for (const path of message.sources || []) add(path);
  for (const path of Object.keys(files)) if (message.text.includes(path)) add(path);

  for (const match of message.text.matchAll(dateLogs)) {
    const month = months.indexOf(match[1].toLowerCase()) + 1;
    for (const dayText of match[2].match(/\d{1,2}/g) || []) {
      const suffix = `-${String(month).padStart(2, '0')}-${String(Number(dayText)).padStart(2, '0')}.md`;
      const candidates = Object.keys(files).filter(path => /(?:^|\/)logs\/\d{4}-\d{2}-\d{2}\.md$/.test(path) && path.endsWith(suffix));
      if (candidates.length === 1) add(candidates[0]);
    }
  }
  const text = normalized(message.text);
  for (const path of Object.keys(files)) {
    const basename = path.split('/').at(-1)?.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || '';
    if (basename.length >= 10 && (basename.match(/[a-z]+/gi) || []).length >= 2 && text.includes(normalized(basename))) add(path);
  }
  return paths;
}
