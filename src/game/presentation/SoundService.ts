import { MUSIC, musicUrl, type MusicTrack } from './music';

export type SoundCue = 'summon' | 'hello-world' | 'sleep' | 'heal' | 'git-push' | 'overclock' | 'foreach' | 'invest' | 'win' | 'lose';
const pitches: Record<SoundCue, number[]> = {
  summon: [330, 440], 'hello-world': [660, 880], sleep: [330, 220], heal: [440, 550, 660],
  'git-push': [220, 330, 550], overclock: [550, 880, 1100], foreach: [880, 660, 330],
  invest: [220, 440, 660], win: [440, 550, 660, 880], lose: [330, 277, 220],
};
interface Voice { oscillator: OscillatorNode; gain: GainNode; owner: number }
/** One browser audio context per app, transient voices owned by scene run. No global input listeners. */
export class SoundService {
  private context?: AudioContext;
  private voices = new Set<Voice>();
  private muted = false;
  private disposed = false;
  private unlocked = false;
  private music?: { track: MusicTrack; owner: number; paused: boolean; element?: HTMLAudioElement };
  constructor(
    private readonly factory: () => AudioContext | undefined = () => typeof AudioContext === 'undefined' ? undefined : new AudioContext(),
    private readonly musicFactory: (url: string) => HTMLAudioElement | undefined = url => typeof Audio === 'undefined' ? undefined : new Audio(url),
  ) {}
  unlock(): void {
    if (this.disposed) return;
    this.unlocked = true;
    try {
      this.context ??= this.factory();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional; browser policy must not block gameplay. */ }
    this.resumeMusic();
  }
  setMuted(value: boolean): void {
    if (this.muted === value) return;
    this.muted = value;
    if (value) { this.stopAll(); this.music?.element?.pause(); }
    else this.resumeMusic();
  }
  playMusic(track: MusicTrack, owner: number): void {
    if (this.disposed || (this.music?.track === track && this.music.owner === owner)) return;
    this.stopMusic();
    this.music = { track, owner, paused: false };
    this.resumeMusic();
  }
  setMusicPaused(owner: number, paused: boolean): void {
    if (!this.music || this.music.owner !== owner || this.music.paused === paused) return;
    this.music.paused = paused;
    if (paused) this.music.element?.pause();
    else this.resumeMusic();
  }
  stopMusic(owner?: number): void {
    if (!this.music || (owner !== undefined && this.music.owner !== owner)) return;
    const element = this.music.element;
    this.music = undefined;
    if (element) { element.pause(); element.removeAttribute('src'); element.load(); }
  }
  private resumeMusic(): void {
    const music = this.music;
    if (this.disposed || !this.unlocked || this.muted || !music || music.paused) return;
    try {
      if (!music.element) {
        music.element = this.musicFactory(musicUrl(music.track));
        if (!music.element) return;
        music.element.loop = true;
        music.element.volume = MUSIC[music.track].volume;
        music.element.playbackRate = 1;
      }
      if (music.element.paused) void music.element.play().catch(() => {});
    } catch { /* Missing files and autoplay restrictions must not block gameplay. */ }
  }
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
  stopRun(owner: number): void { for (const voice of [...this.voices]) if (voice.owner === owner) this.stop(voice); this.stopMusic(owner); }
  stopAll(): void { for (const voice of [...this.voices]) this.stop(voice); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.stopAll(); this.stopMusic(); if (this.context) void this.context.close().catch(() => {}); this.context = undefined; }
  get activeVoiceCount(): number { return this.voices.size; }
  private stop(voice: Voice): void { voice.oscillator.onended = null; try { voice.oscillator.stop(); } catch { /* Already ended. */ } this.release(voice); }
  private release(voice: Voice): void { if (!this.voices.delete(voice)) return; voice.oscillator.onended = null; voice.oscillator.disconnect(); voice.gain.disconnect(); }
}
