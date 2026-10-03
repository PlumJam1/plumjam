import type { BattleSnapshot } from '../game/battle/types';

export interface IntroGuide {
  step: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  key?: string;
  progress: number;
  completed: boolean;
}

/** Reading progress is separate from observed actions; neither dispatches gameplay. */
export interface TutorialProgress {
  initialHeroX: number | null;
  everSummoned: boolean;
  everInvested: boolean;
  everCast: boolean;
  everMoved: boolean;
  acknowledgedThrough: number;
}
export const initialTutorialProgress = (): TutorialProgress => ({
  initialHeroX: null, everSummoned: false, everInvested: false, everCast: false, everMoved: false, acknowledgedThrough: 0,
});
export function observeTutorial(progress: TutorialProgress, snapshot: Pick<BattleSnapshot, 'units' | 'economyLevel' | 'equippedSkills' | 'skillCooldowns' | 'overclockRemaining' | 'hero'>): TutorialProgress {
  const initialHeroX = progress.initialHeroX ?? snapshot.hero.x;
  return {
    ...progress, initialHeroX,
    everSummoned: progress.everSummoned || snapshot.units.some(unit => unit.team === 'human'),
    everInvested: progress.everInvested || snapshot.economyLevel > 1,
    everCast: progress.everCast || snapshot.overclockRemaining > 0 || snapshot.equippedSkills.some(kind => snapshot.skillCooldowns[kind] > 0),
    everMoved: progress.everMoved || Math.abs(snapshot.hero.x - initialHeroX) > 1e-6,
  };
}
/** 1–4 are actions; 5 means that all applicable instructions have been read or observed. */
export function tutorialStep(progress: TutorialProgress, hasSkill: boolean): 1 | 2 | 3 | 4 | 5 {
  if (progress.acknowledgedThrough < 1 && !progress.everSummoned) return 1;
  if (progress.acknowledgedThrough < 2 && !progress.everInvested) return 2;
  if (hasSkill && progress.acknowledgedThrough < 3 && !progress.everCast) return 3;
  if (progress.acknowledgedThrough < 4 && !progress.everMoved) return 4;
  return 5;
}
export function acknowledgeTutorialStep(progress: TutorialProgress, hasSkill: boolean): TutorialProgress {
  return { ...progress, acknowledgedThrough: Math.max(progress.acknowledgedThrough, tutorialStep(progress, hasSkill)) };
}
