import { spawn, spawnSync } from 'node:child_process';
import type { ServerResponse } from 'node:http';

function speechText(text: string): string {
  return text.slice(0, 4000).replace(/https?:\/\/\S+/g, 'a link').replace(/[`*_#>]/g, '').replace(/\s+/g, ' ').trim();
}

export class SpeechRenderer {
  private binary = process.env.OOTS_FTTS_BIN || 'ftts';
  private voice = process.env.OOTS_FTTS_VOICE || 'matt';

  status() {
    const binaryReady = spawnSync(this.binary, ['--version'], { timeout: 5000, stdio: 'ignore' }).status === 0;
    const encoderReady = spawnSync('ffmpeg', ['-version'], { timeout: 5000, stdio: 'ignore' }).status === 0;
    return { available: binaryReady && encoderReady, voiceCloned: this.voice !== 'matt', engine: 'franken_tts (local)', voice: this.voice };
  }

  stream(text: string, response: ServerResponse): Promise<void> {
    const content = speechText(text);
    if (!content) return Promise.reject(new Error('Nothing to speak'));
    if (!this.status().available) return Promise.reject(new Error('franken_tts or ffmpeg is not installed. Run the macOS installer.'));

    return new Promise<void>((resolve, reject) => {
      const tts = spawn(this.binary, ['say', '--profile', 'interactive', '--voice', this.voice, '--stream', 'raw', '-'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
      const encoder = spawn('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let ttsExit: number | null = null;
      let encoderExit: number | null = null;
      let bytes = 0;
      let diagnostic = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        response.off('close', cancelled);
        if (error) {
          tts.kill('SIGTERM'); encoder.kill('SIGTERM');
          reject(error);
        } else {
          response.end(); resolve();
        }
      };
      const cancelled = () => {
        if (!response.writableEnded) finish(new Error('Speech playback cancelled'));
      };
      const complete = () => {
        if (ttsExit === null || encoderExit === null) return;
        if (ttsExit === 0 && encoderExit === 0 && bytes > 0) finish();
        else finish(new Error(diagnostic || 'Local speech generation failed'));
      };
      response.on('close', cancelled);
      tts.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
      encoder.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
      tts.on('error', error => finish(error));
      encoder.on('error', error => finish(error));
      tts.on('close', code => { ttsExit = code ?? -1; complete(); });
      encoder.on('close', code => { encoderExit = code ?? -1; complete(); });
      tts.stdin.on('error', () => {});
      encoder.stdin.on('error', () => {});
      tts.stdout.pipe(encoder.stdin);
      encoder.stdout.on('data', (chunk: Buffer) => {
        if (settled || response.destroyed) return;
        if (bytes === 0) response.setHeader('Content-Type', 'audio/mpeg');
        bytes += chunk.length;
        if (!response.write(chunk)) {
          encoder.stdout.pause();
          response.once('drain', () => encoder.stdout.resume());
        }
      });
      tts.stdin.end(content);
    });
  }
}
