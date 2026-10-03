import type { CharacterKind, UnitKind } from '../battle/types';

/** Immutable source images are loaded once; no crop or resampling at authoring time. */
export const GENERATED_ASSETS = [
  'bg-early', 'bg-mid', 'bg-boss', 'hero', 'hero-lv5', 'melee', 'melee-lv5',
  'ranged', 'ranged-lv5', 'support', 'support-lv5', 'robot-melee', 'robot-ranged', 'boss',
  'technician', 'technician-lv5', 'judge', 'judge-lv5', 'counselor', 'counselor-lv5',
] as const;
export type ArtKey = typeof GENERATED_ASSETS[number];
export const assetUrl = (key: ArtKey): string => {
  const path = `${import.meta.env.BASE_URL}assets/generated/${key}.png`;
  // CSS custom-property URLs otherwise resolve relative to the built CSS file.
  return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href;
};
export const characterArt = (kind: CharacterKind | UnitKind, level = 1): ArtKey =>
  kind === 'gpt-4o' ? 'boss' : kind === 'robot-runner' || kind === 'robot-heavy' ? 'robot-melee' : kind === 'robot-melee' || kind === 'robot-ranged' ? kind : `${kind}${level >= 5 ? '-lv5' : ''}` as ArtKey;
export const backgroundArt = (theme?: 'early' | 'mid' | 'boss'): ArtKey => `bg-${theme ?? 'early'}`;
