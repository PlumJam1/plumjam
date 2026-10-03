import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { DEFAULT_STAGE, ECONOMY, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { StageDefinition, UnitDefinition, UnitKind } from '../src/game/battle/types';

const quietStage = (patch: Partial<StageDefinition> = {}): StageDefinition => ({ ...DEFAULT_STAGE, spawns: [], repeat: undefined, ...patch });
const definitions = (): Record<UnitKind, UnitDefinition> => structuredClone(UNIT_DEFINITIONS);

describe('BattleSession money and lifecycle', () => {
  it('uses one balance for rapid commands and never consumes money on failure', () => {
    const session = new BattleSession({ runId: 1, stage: quietStage({ initialGold: 170 }) });
    expect(session.dispatch({ type: 'summon', kind: 'ranged' }).accepted).toBe(true);
    expect(session.dispatch({ type: 'upgrade-economy' }).accepted).toBe(false);
    expect(session.snapshot().gold).toBe(60);
    expect(session.dispatch({ type: 'summon', kind: 'ranged' }).accepted).toBe(false);
    expect(session.snapshot().gold).toBe(60);
    expect(session.dispatch({ type: 'summon', kind: 'melee' }).accepted).toBe(true);
    expect(session.dispatch({ type: 'summon', kind: 'melee' }).accepted).toBe(false);
    expect(session.snapshot().gold).toBe(0);
    expect(session.snapshot().units).toHaveLength(2);
  });

  it('upgrades income and cap without granting the newly added capacity', () => {
    const session = new BattleSession({ runId: 1, stage: quietStage() });
    expect(session.dispatch({ type: 'upgrade-economy' }).accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ gold: 50, economyLevel: 2, income: 26, goldCap: 650 });
    session.step(30);
    expect(session.snapshot().gold).toBe(ECONOMY[1].cap);
  });

  it('freezes movement, spawns, income and cooldowns while paused and clears held movement', () => {
    const session = new BattleSession({ runId: 1 });
    session.dispatch({ type: 'move', direction: 1 });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.setPaused(true);
    const paused = session.snapshot();
    expect(session.dispatch({ type: 'summon', kind: 'ranged' }).accepted).toBe(false);
    session.step(20);
    expect(session.snapshot()).toEqual(paused);
    session.setPaused(false);
    session.step(1);
    expect(session.snapshot().hero.x).toBe(paused.hero.x);
    expect(session.snapshot().gold).toBeGreaterThan(paused.gold);
  });

  it('provides isolated snapshots and a fresh session resets all transient state', () => {
    const session = new BattleSession({ runId: 1 });
    session.dispatch({ type: 'summon', kind: 'melee' });
    const snapshot = session.snapshot();
    (snapshot.hero as { hp: number }).hp = 0;
    expect(session.snapshot().hero.hp).toBeGreaterThan(0);
    session.dispose();
    expect(session.snapshot().units).toHaveLength(0);
    expect(session.dispatch({ type: 'upgrade-economy' }).accepted).toBe(false);
    const fresh = new BattleSession({ runId: 2 });
    expect(fresh.snapshot()).toMatchObject({ runId: 2, gold: 180, economyLevel: 1, elapsed: 0, units: [] });
  });
});

describe('BattleSession targeting and combat', () => {
  it('attacks the hero ahead of the army, but attacks a company worker ahead of the hero', () => {
    const defs = definitions();
    defs['robot-melee'] = { ...defs['robot-melee'], range: 1000, damage: 10, speed: 0, attackInterval: 0.2 };
    defs.melee = { ...defs.melee, damage: 0, speed: 100 };
    const stage = quietStage({ spawns: [{ at: 0, kind: 'robot-melee' }] });
    const exposed = new BattleSession({ runId: 1, stage, unitDefinitions: defs });
    exposed.dispatch({ type: 'summon', kind: 'melee' });
    exposed.step(0.02);
    expect(exposed.snapshot().hero.hp).toBe(310);
    expect(exposed.snapshot().units.find((unit) => unit.kind === 'melee')?.hp).toBe(180);
    const protectedSession = new BattleSession({ runId: 2, stage, unitDefinitions: defs });
    protectedSession.dispatch({ type: 'summon', kind: 'melee' });
    protectedSession.dispatch({ type: 'move', direction: -1 });
    protectedSession.step(0.7);
    expect(protectedSession.snapshot().hero.hp).toBe(310);
    expect(protectedSession.snapshot().units.find((unit) => unit.kind === 'melee')?.hp).toBeLessThan(180);
  });

  it('attacks and destroys the closer human base while the hero is still alive elsewhere', () => {
    const defs = definitions();
    defs['robot-melee'] = { ...defs['robot-melee'], damage: 10, attackInterval: 0.2 };
    const session = new BattleSession({ runId: 1, unitDefinitions: defs,
      stage: quietStage({ humanBaseHp: 30, spawns: [{ at: 0, kind: 'robot-melee' }] }) });
    session.dispatch({ type: 'move', direction: -1 });
    session.step(22);
    expect(session.snapshot().units[0].x).toBeLessThan(120);
    // Cross past the slow robot. The now-closer base must become its target.
    session.dispatch({ type: 'move', direction: 1 });
    session.step(6);
    expect(session.snapshot().hero.hp).toBeGreaterThan(0);
    expect(session.snapshot().hero.x).toBeGreaterThan(200);
    expect(session.snapshot()).toMatchObject({ status: 'lost', defeatReason: 'base' });
    expect(session.snapshot().humanBase.hp).toBe(0);
  });

  it('keeps attacking the closer AI base when a farther enemy appears behind the ally', () => {
    const defs = definitions();
    defs.melee = { ...defs.melee, speed: 100, range: 5, damage: 10, attackInterval: 0.1 };
    defs['robot-melee'] = { ...defs['robot-melee'], speed: 0, damage: 0 };
    const session = new BattleSession({ runId: 1, unitDefinitions: defs,
      stage: quietStage({ aiBaseHp: 10000, spawns: [{ at: 6, kind: 'robot-melee' }] }) });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.step(6.1);
    const hp = session.snapshot().aiBase.hp;
    session.step(0.4);
    expect(session.snapshot().aiBase.hp).toBeLessThan(hp);
    expect(session.snapshot().units.find((unit) => unit.team === 'ai')?.hp).toBe(110);
  });

  it('the hero has no free attack and death immediately ends combat even with the base intact', () => {
    const defs = definitions();
    defs['robot-melee'] = { ...defs['robot-melee'], speed: 0, range: 1000, damage: 400 };
    const session = new BattleSession({ runId: 1, unitDefinitions: defs, stage: quietStage({ spawns: [{ at: 0, kind: 'robot-melee' }] }) });
    session.step(0.1);
    expect(session.snapshot()).toMatchObject({ status: 'lost', defeatReason: 'hero' });
    expect(session.snapshot().humanBase.hp).toBe(900);
    expect(session.snapshot().units[0].hp).toBe(110);
    const ended = session.snapshot();
    session.step(100);
    expect(session.snapshot()).toEqual(ended);
    expect(session.dispatch({ type: 'summon', kind: 'melee' }).accepted).toBe(false);
    session.setPaused(true);
    expect(session.snapshot().status).toBe('lost');
  });

  it('single-hit projectiles sweep for the first enemy and do not damage a second enemy', () => {
    const defs = definitions();
    defs.ranged = { ...defs.ranged, range: 1000, speed: 0, damage: 30, attackInterval: 1000, projectileSpeed: 10000 };
    defs['robot-melee'] = { ...defs['robot-melee'], speed: 0, damage: 0 };
    const session = new BattleSession({ runId: 1, unitDefinitions: defs, stage: quietStage({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-melee' }] }) });
    session.dispatch({ type: 'summon', kind: 'ranged' });
    session.step(0.1);
    expect(session.snapshot().units.filter((unit) => unit.team === 'ai').map((unit) => unit.hp)).toEqual([80, 110]);
    expect(session.snapshot().projectiles).toHaveLength(0);
    expect(session.snapshot().aiBase.hp).toBe(750);
  });

  it('removes dead fighters and stops them attacking on subsequent steps', () => {
    const defs = definitions();
    defs.melee = { ...defs.melee, range: 1000, damage: 500, speed: 0 };
    defs['robot-melee'] = { ...defs['robot-melee'], range: 1000, damage: 10, speed: 0, attackInterval: 0.01 };
    const session = new BattleSession({ runId: 1, unitDefinitions: defs, stage: quietStage({ spawns: [{ at: 0, kind: 'robot-melee' }] }) });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.step(0.02);
    expect(session.snapshot().units.some((unit) => unit.team === 'ai')).toBe(false);
    const hp = session.snapshot().hero.hp;
    session.step(0.2);
    expect(session.snapshot().hero.hp).toBe(hp);
  });

  it('prioritizes defeat when hero and enemy base die in the same rule step', () => {
    const defs = definitions();
    defs['robot-melee'] = { ...defs['robot-melee'], range: 1000, damage: 400, speed: 0 };
    // The shot passes the spawn point before the robot appears. On the next rule step it hits the
    // base while the newly spawned robot hits the hero, so both terminal conditions are true.
    defs.ranged = { ...defs.ranged, range: 1000, damage: 1000, projectileSpeed: 5700, attackInterval: 1000 };
    const session = new BattleSession({ runId: 1, unitDefinitions: defs, stage: quietStage({ spawns: [{ at: 0.105, kind: 'robot-melee' }] }) });
    session.dispatch({ type: 'summon', kind: 'ranged' });
    session.step(0.12);
    expect(session.snapshot().hero.hp).toBe(0);
    expect(session.snapshot().aiBase.hp).toBe(0);
    expect(session.snapshot().status).toBe('lost');
  });

  it('wins after automatic marching and base combat, and rules agree across frame rates', () => {
    const one = new BattleSession({ runId: 1, stage: quietStage({ aiBaseHp: 46 }) });
    const two = new BattleSession({ runId: 1, stage: quietStage({ aiBaseHp: 46 }) });
    one.dispatch({ type: 'summon', kind: 'melee' });
    two.dispatch({ type: 'summon', kind: 'melee' });
    one.step(25);
    for (let index = 0; index < 250; index++) two.step(0.1);
    expect(one.snapshot().status).toBe('won');
    expect(two.snapshot().status).toBe('won');
    expect(two.snapshot().aiBase.hp).toBe(one.snapshot().aiBase.hp);
  });
});
