import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SoundService } from '../src/game/presentation/SoundService';
import { battleMusic, musicUrl } from '../src/game/presentation/music';

function fixture() {
  const elements: Array<ReturnType<typeof element>> = [];
  function element() {
    return { paused: true, currentTime: 0, loop: false, volume: 1, playbackRate: 1,
      play: vi.fn(async function (this: { paused: boolean }) { this.paused = false; }),
      pause: vi.fn(function (this: { paused: boolean }) { this.paused = true; }),
      removeAttribute: vi.fn(), load: vi.fn() };
  }
  const factory = vi.fn(() => { const audio = element(); elements.push(audio); return audio as unknown as HTMLAudioElement; });
  return { service: new SoundService(() => undefined, factory), elements, factory };
}

describe('background music', () => {
  it('ships the three intact user-provided MP3 originals', () => {
    const hashes = {
      'quirky.mp3': '153aaecf2ad654576e66e365e6c30c991a436fb80c6b0b6cd791ef4631ec7ea8',
      'tower-defense.mp3': 'c08452767f81c6f41e5f0d0206b5ee17e8439868d4ae022e1ed4f349b67ea572',
      'chiptune-boss-fight.mp3': '0678e0fb8fe9d09bcce387be0ae11cc675c3f2b892fed88ab86cf563d205d52c',
    };
    for (const [file, hash] of Object.entries(hashes)) {
      const bytes = readFileSync(new URL(`../public/assets/music/${file}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
    }
  });
  it('selects the boss track by GPT-4o spawns, not the background theme', () => {
    expect(battleMusic('1-1')).toBe('battle');
    expect(battleMusic('2-3')).toBe('battle');
    expect(battleMusic('2-4')).toBe('battle');
    expect(battleMusic('1-5')).toBe('boss');
    expect(battleMusic('2-5')).toBe('boss');
    expect(musicUrl('lobby')).toMatch(/assets\/music\/quirky\.mp3$/);
  });
  it('waits for input, loops at normal speed and does not restart the same track', () => {
    const { service, factory, elements } = fixture();
    service.playMusic('lobby', 1); expect(factory).not.toHaveBeenCalled();
    service.unlock();
    expect(elements[0].loop).toBe(true);
    expect(elements[0].playbackRate).toBe(1);
    service.playMusic('lobby', 1); service.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(elements[0].play).toHaveBeenCalledTimes(1);
    service.dispose();
  });
  it('preserves position across mute and pause and respects both conditions', () => {
    const { service, elements } = fixture();
    service.unlock(); service.playMusic('battle', 2);
    elements[0].currentTime = 23;
    service.setMusicPaused(2, true); service.setMuted(true); service.setMusicPaused(2, false);
    expect(elements[0].play).toHaveBeenCalledTimes(1);
    service.setMuted(false);
    expect(elements[0].play).toHaveBeenCalledTimes(2);
    expect(elements[0].currentTime).toBe(23);
    service.setMusicPaused(2, true); service.setMuted(true); service.setMuted(false);
    expect(elements[0].paused).toBe(true);
    service.setMusicPaused(2, false);
    expect(elements[0].paused).toBe(false);
    service.dispose();
  });
  it('releases previous tracks and ignores cleanup from an older scene', () => {
    const { service, elements } = fixture();
    service.unlock(); service.playMusic('lobby', 1); service.playMusic('boss', 2);
    expect(elements[0].removeAttribute).toHaveBeenCalledWith('src');
    service.stopRun(1); expect(elements[1].paused).toBe(false);
    service.stopRun(2); expect(elements[1].paused).toBe(true);
    service.dispose(); service.playMusic('lobby', 3);
    expect(elements).toHaveLength(2);
  });
  it('survives media errors and retries autoplay rejection on the next gesture', async () => {
    const { service, elements } = fixture();
    service.playMusic('battle', 1); service.unlock();
    elements[0].paused = true;
    elements[0].play.mockRejectedValueOnce(new Error('autoplay denied'));
    service.unlock(); await Promise.resolve();
    expect(() => service.unlock()).not.toThrow();
    service.dispose();
    const unavailable = new SoundService(() => undefined, () => { throw new Error('media unavailable'); });
    expect(() => { unavailable.unlock(); unavailable.playMusic('lobby', 1); unavailable.dispose(); }).not.toThrow();
  });
});
