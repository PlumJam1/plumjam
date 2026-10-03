import { isBossStage } from '../progression/stages';

export const MUSIC = {
  lobby: { file: 'quirky.mp3', title: 'Quirky', artist: 'leberch', volume: 0.22,
    source: 'https://pixabay.com/music/eccentric-quirky-quirky-501484/' },
  battle: { file: 'tower-defense.mp3', title: 'Tower Defense | 8-Bit Chiptune Game Music', artist: 'NickPanek', volume: 0.25,
    source: 'https://pixabay.com/music/video-games-tower-defense-8-bit-chiptune-game-music-358521/' },
  boss: { file: 'chiptune-boss-fight.mp3', title: 'Chiptune Boss Fight Music', artist: 'NickPanek', volume: 0.25,
    source: 'https://pixabay.com/music/video-games-chiptune-boss-fight-music-265080/' },
} as const;
export type MusicTrack = keyof typeof MUSIC;
export const battleMusic = (stageId: string): MusicTrack => isBossStage(stageId) ? 'boss' : 'battle';
export const musicUrl = (track: MusicTrack): string => `${import.meta.env.BASE_URL}assets/music/${MUSIC[track].file}`;
