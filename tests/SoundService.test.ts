import { describe, expect, it, vi } from 'vitest';
import { SoundService } from '../src/game/presentation/SoundService';
import { SFX } from '../src/game/presentation/sfx';
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

describe('SoundService one-shot samples', () => {
  function sampleFixture() {
    const elements: Array<{ play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn>; volume: number; onended: (() => void) | null; onerror: (() => void) | null }> = [];
    const factory = vi.fn(() => { const element = { play: vi.fn(async () => {}), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(), volume: 1, onended: null, onerror: null }; elements.push(element); return element as unknown as HTMLAudioElement; });
    const service = new SoundService(() => undefined, factory);
    return { service, elements, factory };
  }
  it('waits for a gesture, then creates one throwaway element per overlapping cue at its own volume', () => {
    const { service, elements, factory } = sampleFixture();
    service.playSfx('whoosh');
    expect(factory).not.toHaveBeenCalled();
    service.unlock();
    service.playSfx('whoosh'); service.playSfx('punch');
    expect(elements).toHaveLength(2);
    expect(elements[0].play).toHaveBeenCalledTimes(1);
    expect(elements[0].volume).toBe(SFX.whoosh.volume);
    expect(elements[1].volume).toBe(SFX.punch.volume);
    service.dispose();
  });
  it('stays silent while muted or disposed and never throws without audio support', () => {
    const { service, factory } = sampleFixture();
    service.unlock(); service.setMuted(true);
    service.playSfx('magic');
    expect(factory).not.toHaveBeenCalled();
    service.setMuted(false); service.playSfx('magic');
    expect(factory).toHaveBeenCalledTimes(1);
    service.dispose(); service.playSfx('magic');
    expect(factory).toHaveBeenCalledTimes(1);
    const unavailable = new SoundService(() => undefined, () => { throw new Error('media unavailable'); });
    unavailable.unlock();
    expect(() => unavailable.playSfx('punch-02')).not.toThrow();
  });
  it('stops samples already playing on mute, pause cleanup, and disposal', () => {
    const { service, elements } = sampleFixture(); service.unlock();
    service.playSfx('magic'); service.setMuted(true);
    expect(elements[0].pause).toHaveBeenCalledTimes(1);
    expect(elements[0].removeAttribute).toHaveBeenCalledWith('src');
    service.setMuted(false); service.playSfx('punch'); service.stopAll();
    expect(elements[1].pause).toHaveBeenCalledTimes(1);
    service.playSfx('whoosh'); service.dispose(); service.dispose();
    expect(elements[2].pause).toHaveBeenCalledTimes(1);
  });
  it('only releases the departing scene and stops terminal samples', () => {
    const { service, elements } = sampleFixture(); service.unlock();
    service.playSfx('punch', 1); service.playSfx('magic', 2);
    service.stopRun(1); service.stopRun(1);
    expect(elements[0].pause).toHaveBeenCalledTimes(1);
    expect(elements[1].pause).not.toHaveBeenCalled();
    expect(service.activeSampleCount).toBe(1);
    service.stopSfx(2);
    expect(service.activeSampleCount).toBe(0);
    service.dispose();
  });
  it('cleans naturally ended, failed, and rejected samples exactly once', async () => {
    const { service, elements } = sampleFixture(); service.unlock();
    service.playSfx('punch', 1);
    elements[0].onended?.();
    expect(service.activeSampleCount).toBe(0);
    expect(elements[0].onended).toBeNull();
    service.playSfx('magic', 1); elements[1].onerror?.();
    expect(service.activeSampleCount).toBe(0);
    elements[0].play.mockRejectedValueOnce(new Error('autoplay blocked'));
    const rejected = new SoundService(() => undefined, () => elements[0] as unknown as HTMLAudioElement);
    rejected.unlock(); rejected.playSfx('punch', 3);
    rejected.stopRun(3); await Promise.resolve();
    expect(rejected.activeSampleCount).toBe(0);
    expect(elements[0].pause).toHaveBeenCalledTimes(2);
    elements[0].play.mockRejectedValueOnce(new Error('missing file'));
    rejected.playSfx('punch', 3); await Promise.resolve();
    expect(rejected.activeSampleCount).toBe(0);
    expect(elements[0].pause).toHaveBeenCalledTimes(3);
    service.dispose(); rejected.dispose();
    expect(elements[1].pause).toHaveBeenCalledTimes(1);
  });
});
