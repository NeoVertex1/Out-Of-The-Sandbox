import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { bundledVoicePath } from '../server/tts.ts';

test('the packaged default voice is a generated 15-second reference, without the source recording', () => {
  assert.deepEqual(readdirSync('assets/voice'), ['agent-reference-15s.wav']);
  assert.equal(existsSync('assets/voice/voice8.mp3'), false);
  const wav = readFileSync(bundledVoicePath);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  let format: { channels: number; sampleRate: number; bits: number; align: number } | undefined;
  let audioBytes: number | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4), tag = wav.toString('ascii', offset, offset + 4);
    if (tag === 'fmt ') {
      assert.equal(wav.readUInt16LE(offset + 8), 1); // PCM
      format = { channels: wav.readUInt16LE(offset + 10), sampleRate: wav.readUInt32LE(offset + 12), align: wav.readUInt16LE(offset + 20), bits: wav.readUInt16LE(offset + 22) };
    }
    if (tag === 'data') audioBytes = size;
    offset += 8 + size + (size % 2);
  }
  assert.deepEqual(format, { channels: 1, sampleRate: 24000, align: 2, bits: 16 });
  assert.equal(audioBytes, 15 * 24000 * 2);
});
