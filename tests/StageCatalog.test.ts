import { describe, expect, it } from 'vitest';
import { CHAPTERS, CHAPTER_ONE, CHAPTER_TWO, getChapter, getStage, isBossStage, nextStage, STAGES } from '../src/game/progression/stages';

describe('authored two-chapter stage catalog', () => {
  it('keeps five stages per chapter and a continuous ten-stage unlock path', () => {
    expect(CHAPTERS.map(chapter => chapter.stages.length)).toEqual([5, 5]);
    expect(new Set(STAGES.map(stage => stage.id)).size).toBe(10);
    expect(STAGES.slice(0, 5)).toEqual(CHAPTER_ONE);
    expect(nextStage('1-5')?.id).toBe('2-1'); expect(nextStage('2-5')).toBeUndefined();
    expect(getChapter('1-5')?.id).toBe(1); expect(getChapter('2-1')?.id).toBe(2); expect(getChapter('invalid')).toBeUndefined();
  });
  it('raises chapter-two base strength, repeat pressure and rewards without requiring globally monotonic spawn counts', () => {
    for (const [index, stage] of CHAPTER_TWO.entries()) {
      expect(stage.spawns.every((spawn, i) => i === 0 || spawn.at >= stage.spawns[i - 1].at)).toBe(true);
      expect(Math.max(...stage.spawns.map(spawn => spawn.at))).toBeLessThanOrEqual(45);
      if (index > 0) {
        expect(stage.aiBaseHp).toBeGreaterThan(CHAPTER_TWO[index - 1].aiBaseHp);
        expect(stage.clearReward).toBeGreaterThan(CHAPTER_TWO[index - 1].clearReward!);
        expect(stage.repeat!.interval).toBeLessThan(CHAPTER_TWO[index - 1].repeat!.interval);
      }
    }
  });
  it('keeps swarm, ranged, armor, mixed and repeated boss encounters distinct', () => {
    expect(CHAPTER_TWO[0].spawns.filter(spawn => spawn.kind === 'robot-runner').length).toBeGreaterThan(10);
    expect(CHAPTER_TWO[1].spawns.filter(spawn => spawn.kind === 'robot-ranged').length).toBeGreaterThan(CHAPTER_TWO[1].spawns.length / 2);
    expect(CHAPTER_TWO[2].spawns.filter(spawn => spawn.kind === 'robot-heavy').length).toBeGreaterThan(CHAPTER_TWO[2].spawns.length / 2);
    expect(new Set(CHAPTER_TWO[3].spawns.map(spawn => spawn.kind))).toEqual(new Set(['robot-melee', 'robot-ranged', 'robot-heavy', 'robot-runner']));
    expect(getStage('2-5')!.spawns.filter(spawn => spawn.kind === 'gpt-4o').map(spawn => spawn.at)).toEqual([0, 35]);
    expect(isBossStage('1-5')).toBe(true); expect(isBossStage('2-5')).toBe(true);
    expect(isBossStage('2-3')).toBe(false); expect(isBossStage('2-4')).toBe(false); expect(isBossStage('benchmark')).toBe(false);
  });
});
