import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { assetUrl, backgroundArt, characterArt, GENERATED_ASSETS } from '../src/game/presentation/assets';

describe('generated art catalog', () => {
  it('contains fourteen distinct intact PNG source files with expected dimensions', () => {
    expect(new Set(GENERATED_ASSETS).size).toBe(14);
    for (const key of GENERATED_ASSETS) {
      const file = readFileSync(new URL(`../public/assets/generated/${key}.png`, import.meta.url));
      expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(file.readUInt32BE(16)).toBeGreaterThan(1000);
      expect(file.readUInt32BE(20)).toBeGreaterThan(800);
      expect(assetUrl(key)).toMatch(new RegExp(`assets/generated/${key}\\.png$`));
    }
  });
  it('resolves relative Vite assets against the document instead of the built CSS directory', () => {
    vi.stubGlobal('document', { baseURI: 'https://example.test/plumjam/' });
    try {
      expect(assetUrl('bg-early')).toBe(new URL(`${import.meta.env.BASE_URL}assets/generated/bg-early.png`, 'https://example.test/plumjam/').href);
      expect(assetUrl('bg-early')).toMatch(/^https:\/\/example\.test\//);
      expect(assetUrl('bg-early')).not.toContain('/assets/assets/');
    } finally { vi.unstubAllGlobals(); }
  });
  it('chooses evolved humans at level five and never substitutes a robot or boss', () => {
    for (const kind of ['hero', 'melee', 'ranged', 'support'] as const) {
      expect(characterArt(kind, 4)).toBe(kind);
      expect(characterArt(kind, 5)).toBe(`${kind}-lv5`);
      expect(characterArt(kind, 10)).toBe(`${kind}-lv5`);
    }
    expect(characterArt('robot-melee', 10)).toBe('robot-melee');
    expect(characterArt('robot-ranged', 10)).toBe('robot-ranged');
    expect(characterArt('gpt-4o')).toBe('boss');
    expect(backgroundArt()).toBe('bg-early');
    expect(backgroundArt('mid')).toBe('bg-mid');
    expect(backgroundArt('boss')).toBe('bg-boss');
  });
});
