import type { BattleSpeed, CharacterKind, UnitKind } from '../battle/types';

/** Immutable source images are loaded once; no crop or resampling at authoring time. */
export const GENERATED_ASSETS = [
  'bg-early', 'bg-mid', 'bg-boss', 'hero', 'hero-lv5', 'melee', 'melee-lv5',
  'ranged', 'ranged-lv5', 'support', 'support-lv5', 'robot-melee', 'robot-ranged', 'boss',
  'technician', 'technician-lv5', 'judge', 'judge-lv5', 'counselor', 'counselor-lv5',
  'athlete', 'athlete-lv5', 'firefighter', 'firefighter-lv5', 'singer', 'singer-lv5',
] as const;
export type ArtKey = typeof GENERATED_ASSETS[number];
const resolveAssetUrl = (path: string): string => {
  // CSS custom-property URLs otherwise resolve relative to the built CSS file.
  return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href;
};
export const assetUrl = (key: ArtKey): string => resolveAssetUrl(`${import.meta.env.BASE_URL}assets/generated/${key}.png`);

/** Team-provided UI originals use CSS nearest-neighbour scaling, never pixel edits. */
export const UI_ASSETS = ['investment-level-1', 'investment-level-2', 'investment-level-3', 'investment-level-4', 'speed-1', 'speed-2', 'speed-3'] as const;
export type UiArtKey = typeof UI_ASSETS[number];
export const uiAssetUrl = (key: UiArtKey): string => resolveAssetUrl(`${import.meta.env.BASE_URL}assets/ui/${key}.png`);
export const investmentArt = (level: number): UiArtKey => {
  const displayed = Math.max(1, Math.min(4, Math.floor(Number.isFinite(level) ? level : 1)));
  return `investment-level-${displayed}` as UiArtKey;
};
export const speedArt = (speed: BattleSpeed): UiArtKey => `speed-${speed}`;
export const characterArt = (kind: CharacterKind | UnitKind, level = 1): ArtKey =>
  kind === 'gpt-4o' ? 'boss' : kind === 'robot-runner' || kind === 'robot-heavy' ? 'robot-melee' : kind === 'robot-melee' || kind === 'robot-ranged' ? kind : `${kind}${level >= 5 ? '-lv5' : ''}` as ArtKey;
export const backgroundArt = (theme?: 'early' | 'mid' | 'boss'): ArtKey => `bg-${theme ?? 'early'}`;
