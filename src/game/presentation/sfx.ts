export const SFX = {
  punch: { file: 'punch.wav', volume: 0.5 },
  'punch-02': { file: 'punch-02.wav', volume: 0.5 },
  whoosh: { file: 'whoosh.flac', volume: 0.35 },
  'explosive-punch': { file: 'explosive-punch.wav', volume: 0.4 },
  magic: { file: 'magic.wav', volume: 0.4 },
  'industrial-pump': { file: 'industrial-pump.wav', volume: 0.45 },
} as const;
export type SfxKey = keyof typeof SFX;
export const sfxUrl = (key: SfxKey): string => `${import.meta.env.BASE_URL}assets/sfx/${SFX[key].file}`;
