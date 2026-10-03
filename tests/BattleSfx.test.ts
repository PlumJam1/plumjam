import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { battleSfxCues } from '../src/game/presentation/battleSfx';
import type { BattleSnapshot, UnitState } from '../src/game/battle/types';

function base(): BattleSnapshot {
  return new BattleSession({ runId: 1 }).snapshot();
}
function withUnit(snapshot: BattleSnapshot, overrides: Partial<UnitState>): BattleSnapshot {
  const unit: UnitState = {
    id: 900, kind: 'melee', team: 'human', x: 100, bodyWidth: 32, hp: 100, maxHp: 100, level: 1,
    attackCooldown: 0, hitFlash: 0, attackFlash: 0, slowRemaining: 0, weakenRemaining: 0,
    supportCooldown: 0, bossCooldown: 0, buffs: { combat: 0, speed: 0, haste: 0 }, healFlash: 0,
    ...overrides,
  };
  return { ...snapshot, units: [unit] };
}

describe('battle sound cues', () => {
  it('plays nothing without a prior snapshot or across a new run', () => {
    const snapshot = base();
    expect(battleSfxCues(undefined, snapshot)).toEqual([]);
    expect(battleSfxCues({ ...snapshot, runId: 2 }, snapshot)).toEqual([]);
  });

  it('fires once on the rising edge of attackFlash, never while it stays lit or after it drops', () => {
    const snapshot = base();
    const idle = withUnit(snapshot, { attackFlash: 0 });
    const swinging = withUnit(snapshot, { attackFlash: 0.18 });
    expect(battleSfxCues(idle, swinging)).toEqual(['punch-02']);
    expect(battleSfxCues(swinging, swinging)).toEqual([]);
    expect(battleSfxCues(swinging, idle)).toEqual([]);
  });

  it.each([
    ['melee', 'punch-02'], ['robot-melee', 'punch-02'],
    ['technician', 'punch'], ['athlete', 'punch'], ['robot-heavy', 'punch'],
    ['firefighter', 'industrial-pump'],
  ] as const)('maps %s synchronous attacks to %s', (kind, cue) => {
    const snapshot = base();
    const idle = withUnit(snapshot, { kind, attackFlash: 0 });
    const acting = withUnit(snapshot, { kind, attackFlash: 0.18 });
    expect(battleSfxCues(idle, acting)).toEqual([cue]);
  });

  it.each(['support', 'counselor', 'singer'] as const)('plays magic for every %s pulse', kind => {
    const snapshot = base();
    const idle = withUnit(snapshot, { kind, attackFlash: 0 });
    const pulsing = withUnit(snapshot, { kind, attackFlash: 0.3 });
    expect(battleSfxCues(idle, pulsing)).toEqual(['magic']);
  });

  it('stays silent for judge and gpt-4o on their own attackFlash, which is only a windup or a shot', () => {
    const snapshot = base();
    for (const kind of ['judge', 'gpt-4o'] as const) {
      const idle = withUnit(snapshot, { kind, attackFlash: 0 });
      const acting = withUnit(snapshot, { kind, attackFlash: 0.18 });
      expect(battleSfxCues(idle, acting)).toEqual([]);
    }
  });

  it('plays the explosive hit only once a judge-impact or boss-blast effect actually appears', () => {
    const snapshot = base();
    const before = { ...snapshot, effects: [] };
    const judgeStrike = { ...snapshot, effects: [{ id: 1, kind: 'judge-impact' as const, x: 0, radius: 10, remaining: .2, duration: .2 }] };
    const bossBlast = { ...snapshot, effects: [{ id: 2, kind: 'boss-blast' as const, x: 0, radius: 10, remaining: .2, duration: .2 }] };
    expect(battleSfxCues(before, judgeStrike)).toEqual(['explosive-punch']);
    expect(battleSfxCues(before, bossBlast)).toEqual(['explosive-punch']);
    expect(battleSfxCues(judgeStrike, judgeStrike)).toEqual([]);
    const otherEffect = { ...snapshot, effects: [{ id: 3, kind: 'hello-impact' as const, x: 0, radius: 10, remaining: .2, duration: .2 }] };
    expect(battleSfxCues(before, otherEffect)).toEqual([]);
  });

  it('launches on a new projectile and hits when that same projectile later disappears', () => {
    const snapshot = base();
    const projectile = { id: 5, team: 'human' as const, x: 100, direction: 1 as const, damage: 10, speed: 100, remainingRange: 100, source: 'ranged' as const };
    const none = { ...snapshot, projectiles: [] };
    const flying = { ...snapshot, projectiles: [projectile] };
    expect(battleSfxCues(none, flying)).toEqual(['whoosh']);
    expect(battleSfxCues(flying, flying)).toEqual([]);
    expect(battleSfxCues(flying, none)).toEqual(['punch-02']);
    const robotShot = { ...flying, projectiles: [{ ...projectile, id: 6, source: 'robot-ranged' as const }] };
    expect(battleSfxCues(none, robotShot)).toEqual(['whoosh']);
    expect(battleSfxCues(robotShot, none)).toEqual(['punch-02']);
  });

  it('gives the boss and the hero their own hit cue but never a launch cue', () => {
    const snapshot = base();
    const bossShot = { ...snapshot, projectiles: [{ id: 7, team: 'ai' as const, x: 0, direction: -1 as const, damage: 10, speed: 100, remainingRange: 100, source: 'gpt-4o' as const }] };
    const heroShot = { ...snapshot, projectiles: [{ id: 8, team: 'human' as const, x: 0, direction: 1 as const, damage: 10, speed: 100, remainingRange: 100, source: 'hero' as const }] };
    const none = { ...snapshot, projectiles: [] };
    expect(battleSfxCues(none, bossShot)).toEqual([]);
    expect(battleSfxCues(bossShot, none)).toEqual(['explosive-punch']);
    expect(battleSfxCues(none, heroShot)).toEqual([]);
    expect(battleSfxCues(heroShot, none)).toEqual(['punch']);
  });

  it('batches every cue that lands on the same tick', () => {
    const snapshot = base();
    const melee: UnitState = { id: 1, kind: 'melee', team: 'human', x: 10, bodyWidth: 32, hp: 100, maxHp: 100, level: 1,
      attackCooldown: 0, hitFlash: 0, attackFlash: 0, slowRemaining: 0, weakenRemaining: 0, supportCooldown: 0, bossCooldown: 0, buffs: { combat: 0, speed: 0, haste: 0 }, healFlash: 0 };
    const singer: UnitState = { ...melee, id: 2, kind: 'singer', attackFlash: 0 };
    const before = { ...snapshot, units: [melee, singer] };
    const after = { ...snapshot, units: [{ ...melee, attackFlash: .18 }, { ...singer, attackFlash: .3 }] };
    expect(battleSfxCues(before, after).sort()).toEqual(['magic', 'punch-02'].sort());
  });
});
