import { describe, expect, it, vi } from 'vitest';
import { SoundService } from '../src/game/presentation/SoundService';
function fixture() {
  const voices: Array<{ stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
  const gains: ReturnType<typeof vi.fn>[] = [];
  const audio = {
    state: 'running', currentTime: 2, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createOscillator: () => { const voice = { frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null }; voices.push(voice); return voice; },
    createGain: () => { const disconnect = vi.fn(); gains.push(disconnect); return { connect: vi.fn(), disconnect, gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }; },
  };
  const factory = vi.fn(() => audio as unknown as AudioContext);
  return { service: new SoundService(factory), audio, voices, gains, factory };
}
describe('SoundService ownership', () => {
  it('plays both additional skills and releases their tones with the owning run', () => {
    const { service, voices } = fixture(); service.unlock();
    service.play('git-push', 1); service.play('overclock', 2);
    expect(service.activeVoiceCount).toBe(6);
    service.stopRun(1);
    expect(service.activeVoiceCount).toBe(3);
    expect(voices[0].disconnect).toHaveBeenCalledTimes(1);
    expect(voices[3].disconnect).not.toHaveBeenCalled();
    service.dispose();
    expect(service.activeVoiceCount).toBe(0);
  });
  it('creates only one context after a gesture and keeps sound optional before unlock', () => {
    const { service, factory } = fixture();
    service.play('summon', 1); expect(service.activeVoiceCount).toBe(0);
    service.unlock(); service.unlock(); expect(factory).toHaveBeenCalledTimes(1);
    service.play('summon', 1); expect(service.activeVoiceCount).toBe(2);
    service.dispose();
  });
  it('releases only the departing run and disconnects all voices on mute/dispose', () => {
    const { service, audio, voices, gains } = fixture();
    service.unlock(); service.play('summon', 1); service.play('sleep', 2);
    service.stopRun(1); expect(service.activeVoiceCount).toBe(2);
    expect(voices[0].disconnect).toHaveBeenCalledTimes(1); expect(voices[2].disconnect).not.toHaveBeenCalled();
    service.setMuted(true); expect(service.activeVoiceCount).toBe(0);
    service.play('win', 2); expect(service.activeVoiceCount).toBe(0);
    service.setMuted(false); service.play('win', 3);
    service.dispose(); service.dispose(); service.unlock();
    expect(service.activeVoiceCount).toBe(0); expect(audio.close).toHaveBeenCalledTimes(1);
    for (const gain of gains) expect(gain).toHaveBeenCalledTimes(1);
    for (const voice of voices) expect(voice.onended).toBeNull();
  });
  it('frees naturally ended tones without retaining their nodes', () => {
    const { service, voices } = fixture(); service.unlock(); service.play('hello-world', 1);
    voices[0].onended?.(); expect(service.activeVoiceCount).toBe(1);
    expect(voices[0].disconnect).toHaveBeenCalledTimes(1); service.dispose();
  });
  it('continues silently when the browser cannot provide audio', () => {
    const service = new SoundService(() => { throw new Error('unsupported'); });
    expect(() => { service.unlock(); service.play('win', 1); service.dispose(); }).not.toThrow();
  });
});
