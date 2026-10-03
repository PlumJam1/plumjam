import { describe, expect, it } from 'vitest';
import { BattleSession, getFormationCommand } from '../src/game/BattleSession';
import { ALLY_KINDS, DEFAULT_STAGE, SUPPORT, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { AllyKind, StageDefinition, UnitDefinition, UnitKind } from '../src/game/battle/types';

const quiet = (patch: Partial<StageDefinition> = {}): StageDefinition => ({ ...DEFAULT_STAGE, initialGold: 400, spawns: [], repeat: undefined, ...patch });
const stationary = (): Record<UnitKind, UnitDefinition> => Object.fromEntries(Object.entries(UNIT_DEFINITIONS).map(([kind, definition]) => [kind, { ...definition, speed: 0 }])) as Record<UnitKind, UnitDefinition>;
const options = { unlockedAllies: ALLY_KINDS, equippedAllies: ['melee', 'technician', 'judge', 'support', 'counselor'] as const };

describe('immutable five-slot battle formation', () => {
  it('rejects locked and unequipped summons without charging gold or cooldown', () => {
    const session = new BattleSession({ runId: 1, stage: quiet(), unlockedAllies: ALLY_KINDS, equippedAllies: ['melee', null, null, null, null] });
    const before = session.snapshot();
    expect(session.dispatch({ type: 'summon', kind: 'technician' }).accepted).toBe(false);
    expect(session.snapshot()).toEqual(before);
    const locked = new BattleSession({ runId: 2, stage: quiet(), equippedAllies: ['judge', 'melee', null, null, null] });
    const beforeLocked = locked.snapshot();
    expect(locked.dispatch({ type: 'summon', kind: 'judge' }).accepted).toBe(false);
    expect(locked.snapshot()).toEqual(beforeLocked);
    expect(locked.snapshot().equippedAllies).toEqual([null, 'melee', null, null, null]);
  });

  it('maps all five keys including empty slots and copies input/snapshot state', () => {
    const equipped: (AllyKind | null)[] = ['judge', 'technician', null, 'counselor', 'melee'];
    const levels = { judge: 5 };
    const session = new BattleSession({ runId: 1, stage: quiet(), unlockedAllies: ALLY_KINDS, equippedAllies: equipped, levels });
    equipped[0] = 'support'; levels.judge = 1;
    const state = session.snapshot();
    expect(Array.from({ length: 5 }, (_, index) => getFormationCommand(state.equippedAllies, index))).toEqual([
      { type: 'summon', kind: 'judge' }, { type: 'summon', kind: 'technician' }, undefined,
      { type: 'summon', kind: 'counselor' }, { type: 'summon', kind: 'melee' },
    ]);
    expect(getFormationCommand(state.equippedAllies, 5)).toBeUndefined();
    (state.equippedAllies as (AllyKind | null)[])[0] = null;
    (state.levels as { judge: number }).judge = 1;
    session.dispatch({ type: 'summon', kind: 'judge' });
    expect(session.snapshot().units[0]).toMatchObject({ kind: 'judge', level: 5 });
    expect(Object.keys(state.summonCooldowns)).toEqual(ALLY_KINDS);
  });
});

describe('dedicated support roles', () => {
  it('service workers refresh only attack haste on attacking allies, excluding hero and other supports', () => {
    const defs = stationary();
    const session = new BattleSession({ runId: 1, stage: quiet(), unitDefinitions: defs, ...options });
    session.dispatch({ type: 'summon', kind: 'support' });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.dispatch({ type: 'summon', kind: 'counselor' });
    session.step(5.01);
    let state = session.snapshot();
    expect(state.units.find(unit => unit.kind === 'melee')!.buffs.haste).toBeCloseTo(6.99, 1);
    expect(state.hero.buffs).toEqual({ combat: 0, speed: 0, haste: 0 });
    expect(state.units.filter(unit => ['support', 'counselor'].includes(unit.kind)).every(unit => unit.buffs.haste === 0)).toBe(true);
    expect(state.effects.some(effect => effect.kind === 'support-haste')).toBe(true);
    session.step(5);
    state = session.snapshot();
    expect(state.units.find(unit => unit.kind === 'melee')!.buffs.haste).toBeCloseTo(6.99, 1);
    expect(state.units.find(unit => unit.kind === 'melee')!.buffs.combat).toBe(0);
    session.setPaused(true); const paused = session.snapshot(); session.step(10); expect(session.snapshot()).toEqual(paused);
  });

  it('drains only attack cooldown faster and respects the fractional haste expiry boundary', () => {
    const defs = stationary();
    defs.melee = { ...defs.melee, hp: 10000, range: 1000, attackInterval: 30 };
    defs['robot-melee'] = { ...defs['robot-melee'], hp: 100000, damage: 0 };
    const boosted = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }] }), unitDefinitions: defs, ...options });
    const normal = new BattleSession({ runId: 2, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }] }), unitDefinitions: defs, ...options });
    boosted.dispatch({ type: 'summon', kind: 'support' });
    for (const session of [boosted, normal]) { session.dispatch({ type: 'summon', kind: 'melee' }); session.dispatch({ type: 'skill', skill: 'sleep' }); }
    boosted.step(5.1); normal.step(5.1);
    const b = boosted.snapshot(), n = normal.snapshot();
    expect(n.units.find(unit => unit.kind === 'melee')!.attackCooldown - b.units.find(unit => unit.kind === 'melee')!.attackCooldown).toBeCloseTo((.1 + 1 / 60) * (SUPPORT.hasteMultiplier - 1), 5);
    expect(b.skillCooldowns.sleep).toBeCloseTo(n.skillCooldowns.sleep);
    expect(b.summonCooldowns.melee).toBe(n.summonCooldowns.melee);
    expect(b.income).toBe(n.income);
    // Remove the provider through ordinary enemy attacks; the remaining haste expires without stacking.
    const shortDefs = stationary();
    shortDefs.melee = { ...shortDefs.melee, hp: 10000, range: 1000, attackInterval: 30 };
    shortDefs.support.hp = 1;
    shortDefs['robot-melee'] = { ...shortDefs['robot-melee'], hp: 100000, damage: 1, range: 1000, attackInterval: 100 };
    const expiring = new BattleSession({ runId: 3, stage: quiet({ spawns: [{ at: 5.5, kind: 'robot-melee' }] }), unitDefinitions: shortDefs, ...options });
    expiring.dispatch({ type: 'summon', kind: 'support' }); expiring.dispatch({ type: 'summon', kind: 'melee' });
    expiring.dispatch({ type: 'move', direction: -1 }); expiring.step(.4); expiring.dispatch({ type: 'move', direction: 0 });
    expiring.step(5.11);
    expect(expiring.snapshot().units.some(unit => unit.kind === 'support')).toBe(false);
    expiring.step(6.48);
    const before = expiring.snapshot().units.find(unit => unit.kind === 'melee')!;
    expiring.step(.03);
    const after = expiring.snapshot().units.find(unit => unit.kind === 'melee')!;
    expect(after.buffs.haste).toBe(0);
    expect(before.attackCooldown - after.attackCooldown).toBeCloseTo(.03 + before.buffs.haste * .3, 5);
  });

  it('counselors heal nearby hero and allies without damage, haste or overheal', () => {
    const defs = stationary();
    defs.melee.damage = 0;
    defs['robot-melee'] = { ...defs['robot-melee'], damage: 10, range: 1000, attackInterval: 1 };
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }] }), unitDefinitions: defs, ...options });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.dispatch({ type: 'summon', kind: 'counselor' });
    session.step(3); session.dispatch({ type: 'move', direction: -1 }); session.step(.4); session.dispatch({ type: 'move', direction: 0 });
    session.step(1.59); const before = session.snapshot(); session.step(.02); const after = session.snapshot();
    expect(after.units.find(unit => unit.kind === 'melee')!.hp).toBeGreaterThan(before.units.find(unit => unit.kind === 'melee')!.hp);
    expect(after.units.find(unit => unit.kind === 'counselor')!.hp).toBe(after.units.find(unit => unit.kind === 'counselor')!.maxHp);
    expect(after.hero.healFlash).toBeGreaterThan(0);
    expect(after.units.find(unit => unit.kind === 'robot-melee')!.hp).toBe(UNIT_DEFINITIONS['robot-melee'].hp);
    expect(after.hero.hp).toBeLessThanOrEqual(after.hero.maxHp);
    expect(after.units.every(unit => unit.buffs.haste === 0)).toBe(true);
  });
});

describe('new fighting roles and battle lifetime', () => {
  it('uses the strongest human HP for a slow technician and a single-target judge projectile', () => {
    expect(UNIT_DEFINITIONS.technician.hp).toBeGreaterThan(Math.max(...ALLY_KINDS.filter(kind => kind !== 'technician').map(kind => UNIT_DEFINITIONS[kind].hp)));
    expect(UNIT_DEFINITIONS.technician.attackInterval).toBeGreaterThan(UNIT_DEFINITIONS.melee.attackInterval);
    const defs = stationary();
    defs.judge.range = 1000;
    defs['robot-melee'].damage = 0;
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-melee' }] }), unitDefinitions: defs, ...options });
    session.dispatch({ type: 'summon', kind: 'judge' });
    session.step(.02);
    expect(session.snapshot().projectiles).toHaveLength(1);
    expect(session.snapshot().projectiles[0]).toMatchObject({ source: 'judge', damage: 105 });
    session.step(2.4);
    expect(session.snapshot().units.filter(unit => unit.team === 'ai').map(unit => unit.hp)).toEqual([5, 110]);
  });

  it('starts every battle with empty timers and all six cooldown entries, including newly equipped slots', () => {
    const first = new BattleSession({ runId: 1, stage: quiet(), ...options });
    first.dispatch({ type: 'summon', kind: 'technician' }); first.dispatch({ type: 'skill', skill: 'overclock' });
    first.dispose();
    expect(first.dispatch({ type: 'summon', kind: 'judge' }).accepted).toBe(false);
    const restarted = new BattleSession({ runId: 2, stage: quiet(), ...options });
    expect(restarted.snapshot().hero.buffs).toEqual({ combat: 0, speed: 0, haste: 0 });
    expect(Object.values(restarted.snapshot().summonCooldowns).every(value => value === 0)).toBe(true);
    expect(restarted.snapshot().overclockRemaining).toBe(0);
    expect(restarted.dispatch({ type: 'summon', kind: 'counselor' }).accepted).toBe(true);
  });
});
