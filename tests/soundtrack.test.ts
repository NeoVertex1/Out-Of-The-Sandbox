import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { SoundtrackPlayer, soundtrack, shuffleTrackIndexes } from '../src/soundtrack.ts';

test('all bundled soundtrack files are present and each shuffle cycle is unique', () => {
  assert.ok(soundtrack.length >= 18);
  assert.equal(new Set(soundtrack.map(track => track.file)).size, soundtrack.length);
  for (const track of soundtrack) assert.ok(statSync(join('public/audio', track.file)).size > 100_000, `${track.file} is missing or empty`);
  let previous = -1;
  for (let cycle = 0; cycle < 12; cycle++) {
    const order = shuffleTrackIndexes(soundtrack.length, previous);
    assert.equal(new Set(order).size, soundtrack.length);
    assert.deepEqual(order.slice().sort((a, b) => a - b), soundtrack.map((_, index) => index));
    assert.notEqual(order[0], previous);
    previous = order.at(-1)!;
  }
});

test('a session starts music, mute pauses it, and an ended track advances', () => {
  class FakeAudio {
    static latest: FakeAudio;
    src = '';
    preload = '';
    volume = 1;
    paused = true;
    playCalls = 0;
    handlers = new Map<string, () => void>();
    constructor() { FakeAudio.latest = this; }
    addEventListener(kind: string, handler: () => void) { this.handlers.set(kind, handler); }
    pause() { this.paused = true; }
    play() { this.paused = false; this.playCalls++; return Promise.resolve(); }
    removeAttribute(name: string) { if (name === 'src') this.src = ''; }
    emit(kind: string) { this.handlers.get(kind)?.(); }
  }
  const original = globalThis.Audio;
  try {
    (globalThis as any).Audio = FakeAudio;
    const player = new SoundtrackPlayer(false);
    const audio = FakeAudio.latest;
    assert.equal(audio.volume, 0.196);
    player.start();
    const first = audio.src;
    assert.match(first, /^\/audio\/.+\.mp3$/);
    assert.equal(audio.playCalls, 1);
    player.setMuted(true);
    assert.equal(audio.paused, true);
    player.setMuted(false);
    assert.equal(audio.playCalls, 2);
    audio.emit('ended');
    assert.notEqual(audio.src, first);
    assert.equal(audio.playCalls, 3);
    player.stop();
    audio.emit('ended');
    assert.equal(audio.src, '');
  } finally {
    (globalThis as any).Audio = original;
  }
});
