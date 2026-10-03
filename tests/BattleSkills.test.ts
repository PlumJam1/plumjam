import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { DEFAULT_STAGE, SKILLS, SUPPORT, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { StageDefinition, UnitDefinition, UnitKind } from '../src/game/battle/types';

const quietStage = (patch: Partial<StageDefinition> = {}): StageDefinition => ({ ...DEFAULT_STAGE, initialGold: 400, spawns: [], repeat: undefined, ...patch });
const definitions = (): Record<UnitKind, UnitDefinition> => structuredClone(UNIT_DEFINITIONS);
const inertEnemies = () => {
  const defs = definitions();
  for (const kind of ['robot-melee', 'robot-ranged', 'gpt-4o'] as const) defs[kind] = { ...defs[kind], speed: 0, damage: 0 };
  return defs;
};

describe('shared skill funding and pause', () => {
  it('shares gold with summoning and investment, rejecting cooldown/funds without side effects', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep', 'heal'], stage: quietStage({ initialGold: 170 }) });
    expect(session.dispatch({ type: 'skill', skill: 'hello-world' }).accepted).toBe(true);
    expect(session.snapshot().gold).toBe(135);
    const shot = session.snapshot().projectiles[0];
    expect(session.dispatch({ type: 'skill', skill: 'hello-world' }).accepted).toBe(false);
    expect(session.snapshot().projectiles).toEqual([shot]);
    expect(session.dispatch({ type: 'summon', kind: 'melee' }).accepted).toBe(true);
    expect(session.snapshot().gold).toBe(75);
    expect(session.dispatch({ type: 'skill', skill: 'heal' }).accepted).toBe(false);
    expect(session.dispatch({ type: 'upgrade-economy' }).accepted).toBe(false);
    expect(session.snapshot().gold).toBe(75);
    expect(session.snapshot().skillCooldowns.heal).toBe(0);
    expect(session.snapshot().effects).toHaveLength(0);
  });

  it('freezes skill/effect/buff clocks on pause and returns isolated nested snapshots', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep', 'heal'], stage: quietStage(), random: () => 0.5 });
    session.dispatch({ type: 'summon', kind: 'support' });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.step(5.1);
    session.dispatch({ type: 'skill', skill: 'sleep' });
    session.setPaused(true);
    const before = session.snapshot();
    session.step(20);
    expect(session.snapshot()).toEqual(before);
    before.units.find(unit => unit.kind === 'melee')!.buffs.haste = 0;
    expect(session.snapshot().units.find(unit => unit.kind === 'melee')!.buffs.haste).toBeGreaterThan(0);
    expect(session.dispatch({ type: 'skill', skill: 'heal' }).accepted).toBe(false);
    session.setPaused(false);
    session.step(1);
    expect(session.snapshot().skillCooldowns.sleep).toBeCloseTo(9);
    expect(session.snapshot().effects).toHaveLength(0);
  });
});

describe('developer skills', () => {
  it('fires rightwards into only the first enemy even when enemies overlap, then expires', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep', 'heal'], stage: quietStage({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-melee' }] }), unitDefinitions: inertEnemies() });
    session.dispatch({ type: 'move', direction: 1 });
    session.step(4);
    session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'skill', skill: 'hello-world' });
    expect(session.snapshot().projectiles[0]).toMatchObject({ source: 'hero', direction: 1, damage: 75 });
    session.step(0.5);
    expect(session.snapshot().units.map((unit) => unit.hp)).toEqual([35, 110]);
    expect(session.snapshot().aiBase.hp).toBe(750);
    expect(session.snapshot().projectiles).toHaveLength(0);
    expect(session.snapshot().effects).toHaveLength(1);
    expect(session.snapshot().effects[0]).toMatchObject({ kind: 'hello-impact', x: session.snapshot().units[0].x });
    session.step(0.7);
    expect(session.snapshot().effects).toHaveLength(0);
    const empty = new BattleSession({ runId: 2, stage: quietStage() });
    empty.dispatch({ type: 'skill', skill: 'hello-world' });
    empty.step(2);
    expect(empty.snapshot().projectiles).toHaveLength(0);
    expect(empty.snapshot().aiBase.hp).toBe(750);
    expect(empty.snapshot().effects).toHaveLength(0);
  });

  it('only slows enemies in radius, including the boss, and restores movement after five seconds', () => {
    const defs = inertEnemies();
    defs['robot-melee'].speed = 6; defs['robot-melee'].range = 0;
    defs['gpt-4o'].speed = 6; defs['gpt-4o'].range = 0;
    const stage = quietStage({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'gpt-4o' }] });
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep', 'heal'], stage, unitDefinitions: defs });
    session.dispatch({ type: 'skill', skill: 'sleep' });
    session.step(10.1);
    expect(session.snapshot().units.every((unit) => unit.slowRemaining === 0)).toBe(true);
    session.dispatch({ type: 'move', direction: 1 });
    session.step(3.8);
    session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'skill', skill: 'sleep' });
    expect(session.snapshot().units.every((unit) => unit.slowRemaining === 5)).toBe(true);
    const before = session.snapshot().units[0].x;
    session.step(0.5);
    expect(before - session.snapshot().units[0].x).toBeCloseTo(6 * 0.4 * 0.5, 2);
    session.step(4.6);
    expect(session.snapshot().units.every((unit) => unit.slowRemaining === 0)).toBe(true);
    const after = session.snapshot().units[0].x;
    session.step(0.5);
    expect(after - session.snapshot().units[0].x).toBeCloseTo(3, 2);
  });

  it('sleep changes neither damage nor attack frequency', () => {
    const defs = inertEnemies();
    defs['robot-melee'] = { ...defs['robot-melee'], damage: 10, range: 1000, attackInterval: 1 };
    const stage = quietStage({ spawns: [{ at: 4, kind: 'robot-melee' }] });
    const make = (runId: number) => {
      const session = new BattleSession({ runId, unlockedSkills: ['hello-world', 'sleep', 'heal'], stage, unitDefinitions: defs });
      session.dispatch({ type: 'move', direction: 1 });
      session.step(4.05);
      session.dispatch({ type: 'move', direction: 0 });
      return session;
    };
    const slowed = make(1), normal = make(2);
    slowed.dispatch({ type: 'skill', skill: 'sleep' });
    slowed.step(3.5); normal.step(3.5);
    expect(slowed.snapshot().hero.hp).toBe(normal.snapshot().hero.hp);
    expect(slowed.snapshot().units[0].attackCooldown).toBeCloseTo(normal.snapshot().units[0].attackCooldown);
  });

  it('heals the hero and nearby workers, caps HP, and leaves distant workers untouched', () => {
    const defs = inertEnemies();
    defs.melee = { ...defs.melee, damage: 0, speed: 20, range: 0 };
    defs.ranged = { ...defs.ranged, damage: 0, speed: 0 };
    defs['robot-melee'] = { ...defs['robot-melee'], damage: 20, range: 1000, attackInterval: 1 };
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep', 'heal'], stage: quietStage({ spawns: [{ at: 0, kind: 'robot-melee' }] }), unitDefinitions: defs });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.dispatch({ type: 'summon', kind: 'ranged' });
    session.step(8);
    session.dispatch({ type: 'move', direction: 1 });
    session.step(1);
    session.dispatch({ type: 'move', direction: 0 });
    const before = session.snapshot();
    expect(before.hero.hp).toBeLessThan(before.hero.maxHp);
    const melee = before.units.find((unit) => unit.kind === 'melee')!;
    expect(melee.hp).toBeLessThan(melee.maxHp);
    session.dispatch({ type: 'skill', skill: 'heal' });
    const after = session.snapshot();
    expect(after.hero.hp).toBe(after.hero.maxHp);
    expect(after.units.find((unit) => unit.kind === 'melee')!.hp).toBe(Math.min(melee.maxHp, melee.hp + SKILLS.heal.amount));
    expect(after.units.find((unit) => unit.kind === 'ranged')!.healFlash).toBe(0);
    expect(after.effects[0]).toMatchObject({ kind: 'heal', radius: 110 });
  });
});
