import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { ATHLETE, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { BattleSpeed, EnemyKind } from '../src/game/battle/types';

function fixture(enemy: EnemyKind | null = 'robot-melee') {
  const definitions = structuredClone(UNIT_DEFINITIONS);
  // Preserve actual shove, attack interval, damage and bodies; isolate positioning
  // with harmless opponents and a long attack range instead of editing engine state.
  for (const definition of Object.values(definitions)) { definition.damage = 0; definition.speed = 0; }
  definitions.athlete = { ...definitions.athlete, damage: UNIT_DEFINITIONS.athlete.damage, range: 600 };
  definitions['robot-melee'] = { ...definitions['robot-melee'], hp: 1000, speed: 22, range: 0 };
  return new BattleSession({ runId: 1, unitDefinitions: definitions,
    unlockedAllies: ['athlete'], equippedAllies: ['athlete'], unlockedSkills: ['git-push'], equippedSkills: ['git-push'],
    stage: { id: 'athlete-knockback', label: 'Knockback boundaries', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400,
      spawns: enemy ? [{ at: 0, kind: enemy }] : [] } });
}
const opponent = (session: BattleSession) => session.snapshot().units.find(unit => unit.team === 'ai')!;

describe('athlete impulse shares displacement without reducing a stronger push', () => {
  it.each([1, 2, 3] as BattleSpeed[])('moves twenty world units linearly in .15 game seconds at %sx, with one immediate hit', speed => {
    const session = fixture(); session.step(.5);
    expect(session.dispatch({ type: 'summon', kind: 'athlete' }).accepted).toBe(true); session.step(.001);
    const hit = opponent(session);
    expect(hit.hp).toBe(1000 - UNIT_DEFINITIONS.athlete.damage);
    session.dispatch({ type: 'set-speed', speed });
    session.step(ATHLETE.knockbackDuration / 2 / speed);
    expect(opponent(session).x - hit.x).toBeCloseTo(ATHLETE.knockback / 2);
    session.setPaused(true); const paused = session.snapshot(); session.step(1); expect(session.snapshot()).toEqual(paused); session.setPaused(false);
    session.step(ATHLETE.knockbackDuration / 2 / speed);
    expect(opponent(session).x - hit.x).toBeCloseTo(ATHLETE.knockback);
    expect(opponent(session).hp).toBe(hit.hp); // Travel is an impulse, not delayed duplicate damage.
  });

  it('includes a boss but clamps its body before the AI base, and never moves the base', () => {
    const boss = fixture('gpt-4o'); boss.dispatch({ type: 'summon', kind: 'athlete' }); boss.step(.001);
    const hit = opponent(boss); boss.step(ATHLETE.knockbackDuration);
    expect(opponent(boss).x).toBe(boss.snapshot().aiBase.x - hit.bodyWidth / 2);
    expect(opponent(boss).hp).toBe(hit.hp);
    const base = fixture(null); base.dispatch({ type: 'summon', kind: 'athlete' }); base.step(.001);
    const struck = base.snapshot(); base.step(ATHLETE.knockbackDuration);
    expect(base.snapshot().aiBase).toEqual(struck.aiBase);
    expect(struck.aiBase.hp).toBe(struck.aiBase.maxHp - UNIT_DEFINITIONS.athlete.damage);
  });

  it('retains a stronger git-push destination and speed when an athlete strikes during displacement', () => {
    const control = fixture(), combined = fixture();
    for (const session of [control, combined]) {
      session.dispatch({ type: 'move', direction: 1 }); session.step(3.8); session.dispatch({ type: 'move', direction: 0 });
      expect(session.dispatch({ type: 'skill', skill: 'git-push' }).accepted).toBe(true);
    }
    combined.dispatch({ type: 'summon', kind: 'athlete' });
    for (const duration of [.001, .15, .15, .149]) {
      control.step(duration); combined.step(duration);
      expect(opponent(combined).x).toBeCloseTo(opponent(control).x);
    }
    expect(opponent(combined).hp).toBe(opponent(control).hp - UNIT_DEFINITIONS.athlete.damage);
  });
});
