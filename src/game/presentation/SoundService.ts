export type SoundCue = 'summon' | 'hello-world' | 'sleep' | 'heal' | 'git-push' | 'overclock' | 'invest' | 'win' | 'lose';
const pitches: Record<SoundCue, number[]> = {
  summon: [330, 440], 'hello-world': [660, 880], sleep: [330, 220], heal: [440, 550, 660],
  'git-push': [220, 330, 550], overclock: [550, 880, 1100],
  invest: [220, 440, 660], win: [440, 550, 660, 880], lose: [330, 277, 220],
};
interface Voice { oscillator: OscillatorNode; gain: GainNode; owner: number }
/** One browser audio context per app, transient voices owned by scene run. No global input listeners. */
export class SoundService {
  private context?: AudioContext;
  private voices = new Set<Voice>();
  private muted = false;
  private disposed = false;
  constructor(private readonly factory: () => AudioContext | undefined = () => typeof AudioContext === 'undefined' ? undefined : new AudioContext()) {}
  unlock(): void {
    if (this.disposed) return;
    try {
      this.context ??= this.factory();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional; browser policy must not block gameplay. */ }
  }
  setMuted(value: boolean): void { this.muted = value; if (value) this.stopAll(); }
  play(cue: SoundCue, owner: number): void {
    const audio = this.context;
    if (this.disposed || this.muted || !audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    pitches[cue].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = now + index * 0.055;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.018, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
      oscillator.connect(gain); gain.connect(audio.destination);
      const voice = { oscillator, gain, owner };
      this.voices.add(voice);
      oscillator.onended = () => this.release(voice);
      oscillator.start(start); oscillator.stop(start + 0.08);
    });
  }
  stopRun(owner: number): void { for (const voice of [...this.voices]) if (voice.owner === owner) this.stop(voice); }
  stopAll(): void { for (const voice of [...this.voices]) this.stop(voice); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.stopAll(); if (this.context) void this.context.close().catch(() => {}); this.context = undefined; }
  get activeVoiceCount(): number { return this.voices.size; }
  private stop(voice: Voice): void { voice.oscillator.onended = null; try { voice.oscillator.stop(); } catch { /* Already ended. */ } this.release(voice); }
  private release(voice: Voice): void { if (!this.voices.delete(voice)) return; voice.oscillator.onended = null; voice.oscillator.disconnect(); voice.gain.disconnect(); }
}
