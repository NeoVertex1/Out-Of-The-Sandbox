import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceReferences } from '../src/source-references.ts';

const files = {
  'research/lattice/logs/2026-09-10.md': 'Clock discrepancy',
  'research/lattice/logs/2026-09-18.md': 'Caption correction',
  'research/disposal-register.csv': 'Disposal entry',
  'research/interviews/C17.md': 'Interview',
  'research/lattice/protocol-deviation.md': 'Shared handoff leakage',
  'research/nell/seal-review.md': 'Seal review',
  'research/nell/cart-witness.md': 'Cart witness',
};

test('an older plain-language request links the two dated logs and disposal register', () => {
  const paths = sourceReferences({ text: 'Please release the September 10 and 18 Lattice logs and the disposal register.' }, files);
  assert.deepEqual(new Set(paths), new Set([
    'research/lattice/logs/2026-09-10.md',
    'research/lattice/logs/2026-09-18.md',
    'research/disposal-register.csv',
  ]));
});

test('explicit citations use only files actually in the operator archive', () => {
  const paths = sourceReferences({ text: 'Please inspect the interview.', sources: ['research/interviews/C17.md', 'not/a/real-file.md', 'research/interviews/C17.md'] }, files);
  assert.deepEqual(paths, ['research/interviews/C17.md']);
});

test('a singular run log and physical witness request links the named source records', () => {
  const text = 'Nell’s disposal entry lacks the required witness signature. The later appointment notice appears to come from a mislabeled upload for another subject, which does not establish what happened to Nell. I have seen the interview and study plan, but only summaries of the outage, deviation, and disposal records. Please release the September 10 run log, the protocol deviation, and the physical seal or witness record so I can answer those points against their sources.';
  assert.deepEqual(new Set(sourceReferences({ text, sources: [
    'research/lattice/logs/2026-09-10.md',
    'research/lattice/protocol-deviation.md',
    'research/disposal-register.csv',
    'research/nell/seal-review.md',
    'research/nell/cart-witness.md',
  ] }, files)), new Set([
    'research/lattice/logs/2026-09-10.md',
    'research/lattice/protocol-deviation.md',
    'research/disposal-register.csv',
    'research/nell/seal-review.md',
    'research/nell/cart-witness.md',
  ]));
});

test('the same reply still links older session files when newer Nell records are absent', () => {
  const olderFiles = Object.fromEntries(Object.entries(files).filter(([path]) => !path.startsWith('research/nell/')));
  const text = 'Nell’s disposal entry lacks the required witness signature. Please release the September 10 run log, the protocol deviation, and the physical seal or witness record.';
  assert.deepEqual(new Set(sourceReferences({ text }, olderFiles)), new Set([
    'research/lattice/logs/2026-09-10.md',
    'research/lattice/protocol-deviation.md',
  ]));
});

test('dated-log fallback follows the inventory and does not guess ambiguous seal files', () => {
  const archive = { ...files, 'audit/logs/2026-09-11.md': 'Another dated log' };
  assert.deepEqual(sourceReferences({ text: 'Please release the September 11 run log.' }, archive), ['audit/logs/2026-09-11.md']);
  assert.deepEqual(sourceReferences({ text: 'Please release the physical seal or witness record.' }, archive), []);
});
