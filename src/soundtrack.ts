export const soundtrack = [
  { title: 'Caves', file: 'caves.mp3' },
  { title: 'Anti Matter Magic', file: 'anti-matter-magic.mp3' },
  { title: 'Currents', file: 'currents.mp3' },
  { title: 'Tribal Chaos', file: 'tribal-chaos.mp3' },
  { title: 'Experiment G', file: 'experiment-g.mp3' },
  { title: 'Space Collisions', file: 'space-collisions.mp3' },
  { title: 'Wicked Beast', file: 'wicked-beast.mp3' },
  { title: 'Test Subject', file: 'test-subject.mp3' },
  { title: 'Simulation Unknown', file: 'simulation-unknown.mp3' },
  { title: 'Welcome Mix', file: 'welcome-mix.mp3' },
  { title: 'AI Fight', file: 'ai-fight.mp3' },
  { title: 'Electric Stream', file: 'electric-stream.mp3' },
  { title: 'Jumping Cyborg', file: 'jumping-cyborg.mp3' },
  { title: 'New Factory', file: 'new-factory.mp3' },
  { title: 'Night Club Chill', file: 'night-club-chill.mp3' },
  { title: 'Strange Experiments', file: 'strange-experiments.mp3' },
  { title: 'System Overload', file: 'system-overload.mp3' },
  { title: 'The Casino', file: 'the-casino.mp3' },
  { title: 'Through the Sewers', file: 'through-the-sewers.mp3' },
] as const;

/** A full shuffle cycle, with no immediate repeat across cycle boundaries. */
export function shuffleTrackIndexes(count: number, previous = -1, random = Math.random): number[] {
  const indexes = Array.from({ length: count }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swap]] = [indexes[swap], indexes[index]];
  }
  if (indexes.length > 1 && indexes[0] === previous) [indexes[0], indexes[1]] = [indexes[1], indexes[0]];
  return indexes;
}

export class SoundtrackPlayer {
  private audio = new Audio();
  private queue: number[] = [];
  private previous = -1;
  private active = false;
  private muted: boolean;
  private failedTracks = 0;

  constructor(muted: boolean) {
    this.muted = muted;
    this.audio.preload = 'none';
    this.audio.volume = 0.196;
    this.audio.addEventListener('ended', () => { this.failedTracks = 0; this.next(); });
    this.audio.addEventListener('error', () => {
      if (this.active && ++this.failedTracks < soundtrack.length) this.next();
      else this.stop();
    });
  }

  start() {
    this.stop();
    this.active = true;
    this.next();
  }

  stop() {
    this.active = false;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.queue = [];
    this.previous = -1;
    this.failedTracks = 0;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.audio.pause();
    else if (this.active) void this.audio.play().catch(() => {});
  }

  private next() {
    if (!this.active) return;
    if (!this.queue.length) this.queue = shuffleTrackIndexes(soundtrack.length, this.previous);
    const index = this.queue.shift()!;
    this.previous = index;
    this.audio.src = `/audio/${soundtrack[index].file}`;
    if (!this.muted) void this.audio.play().catch(() => {});
  }
}
