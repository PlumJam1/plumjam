import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { assetUrl, backgroundArt, characterArt, GENERATED_ASSETS } from '../src/game/presentation/assets';

describe('generated art catalog', () => {
  it('contains twenty distinct intact PNG source files with expected dimensions', () => {
    expect(new Set(GENERATED_ASSETS).size).toBe(20);
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
  it('preserves the six transparent roster originals recorded in the art manifest', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/assets/generated/ASSET_METADATA.json', import.meta.url), 'utf8'));
    for (const key of ['technician', 'technician-lv5', 'judge', 'judge-lv5', 'counselor', 'counselor-lv5'] as const) {
      const file = readFileSync(new URL(`../public/assets/generated/${key}.png`, import.meta.url));
      const entry = manifest.find((item: { name: string }) => item.name === `${key}.png`);
      expect(file[25]).toBe(6); // Original PNG IHDR colour type is RGBA.
      expect(entry.alphaRange).toEqual([0, 255]);
      expect(entry.generator).toBe('built-in image_gen.imagegen');
      expect(createHash('sha256').update(file).digest('hex')).toBe(entry.sha256);
    }
  });
  it('chooses evolved humans at level five and never substitutes a robot or boss', () => {
    for (const kind of ['hero', 'melee', 'ranged', 'support', 'technician', 'judge', 'counselor'] as const) {
      expect(characterArt(kind, 4)).toBe(kind);
      expect(characterArt(kind, 5)).toBe(`${kind}-lv5`);
      expect(characterArt(kind, 10)).toBe(`${kind}-lv5`);
    }
    expect(characterArt('robot-melee', 10)).toBe('robot-melee');
    expect(characterArt('robot-heavy', 10)).toBe('robot-melee');
    expect(characterArt('robot-ranged', 10)).toBe('robot-ranged');
    expect(characterArt('gpt-4o')).toBe('boss');
    expect(backgroundArt()).toBe('bg-early');
    expect(backgroundArt('mid')).toBe('bg-mid');
    expect(backgroundArt('boss')).toBe('bg-boss');
  });
});
