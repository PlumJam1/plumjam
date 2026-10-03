import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { ALLY_KINDS, BOSS, DEFAULT_STAGE, SKILLS, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { AllyKind, BattleSpeed, SkillKind, StageDefinition } from '../src/game/battle/types';

const quiet = (patch: Partial<StageDefinition> = {}): StageDefinition => ({ ...DEFAULT_STAGE, initialGold: 400, spawns: [], repeat: undefined, ...patch });
const defs = () => Object.fromEntries(Object.entries(UNIT_DEFINITIONS).map(([kind, definition]) => [kind, {
  ...definition, speed: 0, ...(definition.team === 'human' ? { cost: 0 } : { damage: 0, hp: 1000 }),
}])) as typeof UNIT_DEFINITIONS;
const formation: readonly AllyKind[] = ALLY_KINDS;
const options = { unlockedAllies: ALLY_KINDS, equippedAllies: formation, unlockedSkills: Object.keys(SKILLS) as SkillKind[], equippedSkills: ['foreach', 'git-push', 'hello-world'] as SkillKind[] };
const unit = (session: BattleSession, kind: string) => session.snapshot().units.find(unit => unit.kind === kind)!;

describe('tracking judge hammer', () => {
  it('tracks the chosen unit through movement and range exit, hits exactly one target after .25+.35 seconds', () => {
    const definitions = defs(); definitions.judge.speed = 18;
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-melee' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'move', direction: 1 }); session.step(340 / 86); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'summon', kind: 'judge' });
    while (!session.snapshot().judgeAttacks.length) session.step(1 / 60);
    const attack = session.snapshot().judgeAttacks[0]!;
    expect(session.snapshot().projectiles).toHaveLength(0);
    expect(attack.duration).toBeCloseTo(.6);
    session.dispatch({ type: 'skill', skill: 'git-push' }); session.step(.3);
    const target = session.snapshot().units.find(unit => unit.id === attack.targetId)!;
    expect(target.x - unit(session, 'judge').x).toBeGreaterThan(UNIT_DEFINITIONS.judge.range);
    expect(session.snapshot().judgeAttacks[0]!.x).toBe(target.x);
    expect(target.hp).toBe(1000);
    session.step(.3);
    expect(session.snapshot().judgeAttacks).toHaveLength(0);
    expect(session.snapshot().units.filter(unit => unit.team === 'ai').map(unit => unit.hp)).toEqual([895, 1000]);
    session.step(.5);
    expect(session.snapshot().units.filter(unit => unit.team === 'ai').map(unit => unit.hp)).toEqual([895, 1000]);
  });

  it('cancels a dead target or caster and can land on the enemy base', () => {
    const definitions = defs(); definitions.judge.range = 1000; definitions.ranged.range = 1000; definitions.ranged.damage = 2000; definitions.ranged.projectileSpeed = 10000;
    const targetDies = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }] }), unitDefinitions: definitions, ...options });
    targetDies.dispatch({ type: 'summon', kind: 'judge' }); targetDies.step(.01);
    targetDies.step(.2); targetDies.dispatch({ type: 'summon', kind: 'ranged' }); targetDies.step(.1);
    expect(targetDies.snapshot().units.some(unit => unit.kind === 'robot-melee')).toBe(false);
    expect(targetDies.snapshot().judgeAttacks).toHaveLength(0);
    expect(targetDies.snapshot().effects.some(effect => effect.kind === 'judge-impact')).toBe(false);

    const lethal = defs(); lethal.judge.range = 1000; lethal.judge.hp = 1;
    lethal['robot-ranged'] = { ...lethal['robot-ranged'], damage: 1000, range: 1000, projectileSpeed: undefined, attackInterval: 100 };
    const sourceDies = new BattleSession({ runId: 2, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: .5, kind: 'robot-ranged' }] }), unitDefinitions: lethal, ...options });
    sourceDies.dispatch({ type: 'move', direction: -1 }); sourceDies.step(.4); sourceDies.dispatch({ type: 'move', direction: 0 });
    sourceDies.dispatch({ type: 'summon', kind: 'judge' }); sourceDies.step(.01);
    expect(sourceDies.snapshot().judgeAttacks).toHaveLength(1);
    sourceDies.step(.6);
    expect(sourceDies.snapshot().units.some(unit => unit.kind === 'judge')).toBe(false);
    expect(sourceDies.snapshot().judgeAttacks).toHaveLength(0);
    expect(unit(sourceDies, 'robot-melee').hp).toBe(1000);

    const base = new BattleSession({ runId: 3, stage: quiet(), unitDefinitions: definitions, ...options });
    base.dispatch({ type: 'summon', kind: 'judge' }); base.step(.01);
    expect(base.snapshot().judgeAttacks[0]!.targetId).toBe(base.snapshot().aiBase.id);
    base.step(.6);
    expect(base.snapshot().aiBase.hp).toBe(quiet().aiBaseHp - 105);
  });

  it('cancels impact when its caster dies on the exact final fall step', () => {
    const definitions = defs(); definitions.judge.range = 1000; definitions.judge.hp = 1;
    definitions['robot-ranged'] = { ...definitions['robot-ranged'], damage: 1000, range: 1000, projectileSpeed: undefined, attackInterval: 100 };
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 1.01, kind: 'robot-ranged' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'move', direction: -1 }); session.step(.4); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'summon', kind: 'judge' }); session.step(1 / 60);
    for (let tick = 0; tick < 35; tick++) session.step(1 / 60);
    expect(unit(session, 'judge').hp).toBe(1);
    expect(session.snapshot().judgeAttacks[0]!.remaining).toBeCloseTo(1 / 60);
    session.step(1 / 60);
    expect(session.snapshot().units.some(unit => unit.kind === 'judge')).toBe(false);
    expect(unit(session, 'robot-melee').hp).toBe(1000);
    expect(session.snapshot().judgeAttacks).toHaveLength(0);
    expect(session.snapshot().effects.some(effect => effect.kind === 'judge-impact')).toBe(false);
  });
});

describe('four-tick firefighter water channel', () => {
  it('deals 15 damage to every unit and base in the forward line on each of four .25-second ticks, staying still', () => {
    const definitions = defs(); definitions.firefighter.range = 600; definitions.firefighter.speed = 20;
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-ranged' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'summon', kind: 'firefighter' }); session.step(.001);
    const sourceX = unit(session, 'firefighter').x;
    session.step(.249);
    expect(session.snapshot().units.filter(unit => unit.team === 'ai').every(unit => unit.hp === 1000)).toBe(true);
    session.step(.001);
    for (let tick = 1; tick <= 4; tick++) {
      expect(session.snapshot().units.filter(unit => unit.team === 'ai').map(unit => unit.hp)).toEqual([1000 - tick * 15, 1000 - tick * 15]);
      expect(session.snapshot().aiBase.hp).toBe(quiet().aiBaseHp - tick * 15);
      expect(unit(session, 'firefighter').x).toBe(sourceX);
      if (tick < 4) session.step(.25);
    }
    expect(session.snapshot().waterChannels).toHaveLength(0);
    session.step(.5);
    expect(session.snapshot().aiBase.hp).toBe(quiet().aiBaseHp - 60);
  });

  it('cancels the remaining channel when its source dies and freezes every tick during pause', () => {
    const definitions = defs(); definitions.firefighter.range = 600; definitions.firefighter.hp = 1;
    definitions['robot-ranged'] = { ...definitions['robot-ranged'], damage: 1000, range: 1000, projectileSpeed: undefined, attackInterval: 100 };
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: .6, kind: 'robot-ranged' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'move', direction: -1 }); session.step(.4); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'summon', kind: 'firefighter' }); session.step(.01);
    session.setPaused(true); const paused = session.snapshot(); session.step(3); expect(session.snapshot()).toEqual(paused);
    session.setPaused(false); session.step(.6);
    expect(session.snapshot().waterChannels).toHaveLength(0);
    expect(unit(session, 'robot-melee').hp).toBe(1000);
    expect(session.snapshot().aiBase.hp).toBe(quiet().aiBaseHp);
  });

  it('cancels the fourth tick when an ordinary attack kills the caster on the exact final channel step', () => {
    const definitions = defs(); definitions.firefighter.range = 600; definitions.firefighter.hp = 1;
    definitions['robot-ranged'] = { ...definitions['robot-ranged'], damage: 1000, range: 1000, projectileSpeed: undefined, attackInterval: 100 };
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 1.41, kind: 'robot-ranged' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'move', direction: -1 }); session.step(.4); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'summon', kind: 'firefighter' }); session.step(1 / 60);
    for (let tick = 0; tick < 59; tick++) session.step(1 / 60);
    expect(unit(session, 'firefighter').hp).toBe(1);
    expect(session.snapshot().waterChannels[0]!.remaining).toBeCloseTo(1 / 60);
    expect(unit(session, 'robot-melee').hp).toBe(955);
    session.step(1 / 60);
    expect(session.snapshot().units.some(unit => unit.kind === 'firefighter')).toBe(false);
    expect(unit(session, 'robot-melee').hp).toBe(955);
    expect(session.snapshot().waterChannels).toHaveLength(0);
  });
});

describe('singer support on both teams', () => {
  it('refreshes allies including hero/support, debuffs boss attacks, and combines outgoing/defensive multipliers once', () => {
    const definitions = defs(); definitions['gpt-4o'] = { ...definitions['gpt-4o'], speed: 100, range: 20 };
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'gpt-4o' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'summon', kind: 'singer' }); session.dispatch({ type: 'summon', kind: 'support' });
    session.step(5.01);
    let state = session.snapshot();
    expect(state.hero.buffs.combat).toBeCloseTo(6.99, 1);
    expect(unit(session, 'support').buffs.combat).toBeCloseTo(6.99, 1);
    expect(unit(session, 'gpt-4o').weakenRemaining).toBeCloseTo(6.99, 1);
    expect(state.hero.buffs.haste).toBe(0);
    session.step(BOSS.firstCastDelay - state.elapsed + BOSS.windup + .01);
    expect(session.snapshot().hero.hp).toBeCloseTo(320 - 80 * .75 * .75);
    session.step(10.01 - session.snapshot().elapsed);
    state = session.snapshot();
    expect(state.hero.buffs.combat).toBeCloseTo(6.99, 1);
    expect(unit(session, 'gpt-4o').weakenRemaining).toBeCloseTo(6.99, 1);
    expect(state.hero.buffs.combat).toBeLessThanOrEqual(7);
    // The base takes the debuffed boss damage, but never receives singer's defensive buff.
    expect(state.humanBase.hp).toBe(quiet().humanBaseHp - 80 * .75);
  });

  it('starts evolved athletes and firefighters with the same shared level multiplier', () => {
    const session = new BattleSession({ runId: 1, stage: quiet(), unitDefinitions: defs(), ...options, levels: { athlete: 5, firefighter: 5, singer: 5 } });
    for (const kind of ['athlete', 'firefighter', 'singer'] as AllyKind[]) session.dispatch({ type: 'summon', kind });
    expect(unit(session, 'athlete').maxHp).toBe(260 * 1.6);
    expect(unit(session, 'firefighter').maxHp).toBe(220 * 1.6);
    expect(unit(session, 'singer').maxHp).toBe(110 * 1.6);
  });
});

describe('fixed landing foreach attack', () => {
  it('includes the left radius boundary, excludes the next position outside it and never harms allies', () => {
    const definitions = defs();
    definitions['robot-melee'] = { ...definitions['robot-melee'], speed: 1000, range: 90 };
    definitions['robot-ranged'] = { ...definitions['robot-ranged'], speed: 1000, range: 89.99 };
    definitions['robot-runner'] = { ...definitions['robot-runner'], speed: 1000, range: 90.01 };
    const travel = 260 / 86;
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: travel + .001, kind: 'robot-melee' }, { at: travel + .001, kind: 'robot-ranged' }, { at: travel + .001, kind: 'robot-runner' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'move', direction: 1 }); session.step(travel); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'summon', kind: 'melee' }); session.step(.2);
    expect(unit(session, 'robot-melee').x).toBeCloseTo(460);
    expect(unit(session, 'robot-ranged').x).toBeCloseTo(459.99);
    expect(unit(session, 'robot-runner').x).toBeCloseTo(460.01);
    const heroHp = session.snapshot().hero.hp, allyHp = unit(session, 'melee').hp;
    session.dispatch({ type: 'skill', skill: 'foreach' }); session.step(.7);
    expect(unit(session, 'robot-melee').hp).toBe(905);
    expect(unit(session, 'robot-ranged').hp).toBe(1000);
    expect(unit(session, 'robot-runner').hp).toBe(905);
    expect(session.snapshot().hero.hp).toBe(heroHp); expect(unit(session, 'melee').hp).toBe(allyHp);
  });

  it('rejects insufficient funds and repeated cooldown input atomically for equipped foreach', () => {
    const poor = new BattleSession({ runId: 1, stage: quiet({ initialGold: 99 }), ...options }); const before = poor.snapshot();
    expect(poor.dispatch({ type: 'skill', skill: 'foreach' })).toMatchObject({ accepted: false, reason: 'foreach()에 쓸 자금이 부족해.' });
    expect(poor.snapshot()).toEqual(before);
    const session = new BattleSession({ runId: 2, stage: quiet(), ...options });
    expect(session.dispatch({ type: 'skill', skill: 'foreach' }).accepted).toBe(true);
    const cast = session.snapshot();
    expect(session.dispatch({ type: 'skill', skill: 'foreach' })).toMatchObject({ accepted: false, reason: 'foreach() 준비 중이야.' });
    expect(session.snapshot()).toEqual(cast);
  });
  it.each([1, 2, 3] as BattleSpeed[])('lands once on every enemy unit (including boss) after .7 game seconds at %sx, excluding the base', speed => {
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-melee' }, { at: 0, kind: 'gpt-4o' }] }), unitDefinitions: defs(), ...options });
    session.dispatch({ type: 'move', direction: 1 }); session.step(260 / 86); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'set-speed', speed });
    expect(session.dispatch({ type: 'skill', skill: 'foreach' }).accepted).toBe(true);
    const flight = session.snapshot().foreachFlights[0]!;
    expect(flight).toMatchObject({ radius: 90, duration: .7 });
    expect(flight.startX).toBeCloseTo(370); expect(flight.x).toBeCloseTo(550);
    session.dispatch({ type: 'move', direction: -1 });
    session.step(.69 / speed);
    expect(session.snapshot().units.filter(unit => unit.team === 'ai').every(unit => unit.hp === 1000)).toBe(true);
    expect(session.snapshot().foreachFlights[0]!.x).toBe(flight.x);
    session.setPaused(true); const paused = session.snapshot(); session.step(3); expect(session.snapshot()).toEqual(paused);
    session.setPaused(false); session.step(.01 / speed);
    expect(session.snapshot().foreachFlights).toHaveLength(0);
    expect(session.snapshot().units.filter(unit => unit.team === 'ai').map(unit => unit.hp)).toEqual([905, 905, 905]);
    expect(session.snapshot().aiBase.hp).toBe(quiet().aiBaseHp);
    expect(session.snapshot().effects.filter(effect => effect.kind === 'foreach-impact')).toHaveLength(1);
    session.step(.5 / speed);
    expect(session.snapshot().units.filter(unit => unit.team === 'ai').map(unit => unit.hp)).toEqual([905, 905, 905]);
  });

  it('captures level and singer damage at cast even when the buff expires in flight', () => {
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }] }), unitDefinitions: defs(), ...options, levels: { hero: 5 } });
    session.dispatch({ type: 'summon', kind: 'singer' }); session.step(5.1);
    session.dispatch({ type: 'move', direction: 1 }); session.step(260 / 86); session.dispatch({ type: 'move', direction: 0 });
    session.step(11.7 - session.snapshot().elapsed);
    expect(session.snapshot().hero.buffs.combat).toBeGreaterThan(0);
    session.dispatch({ type: 'skill', skill: 'foreach' }); session.step(.7);
    expect(session.snapshot().hero.buffs.combat).toBe(0);
    expect(unit(session, 'robot-melee').hp).toBeCloseTo(1000 - 95 * 1.6 * 1.3);
  });

  it('rejects locked/unequipped casts without charging and cancels flight on hero death or disposal', () => {
    const locked = new BattleSession({ runId: 1, stage: quiet() }); const initial = locked.snapshot();
    expect(locked.dispatch({ type: 'skill', skill: 'foreach' }).accepted).toBe(false); expect(locked.snapshot()).toEqual(initial);
    const unequipped = new BattleSession({ runId: 2, stage: quiet(), unlockedSkills: ['hello-world', 'foreach'], equippedSkills: ['hello-world'] });
    const before = unequipped.snapshot(); expect(unequipped.dispatch({ type: 'skill', skill: 'foreach' }).accepted).toBe(false); expect(unequipped.snapshot()).toEqual(before);
    const definitions = defs(); definitions['robot-melee'] = { ...definitions['robot-melee'], range: 1000, damage: 1000 };
    const dying = new BattleSession({ runId: 3, stage: quiet({ spawns: [{ at: .1, kind: 'robot-melee' }] }), unitDefinitions: definitions, ...options });
    dying.dispatch({ type: 'skill', skill: 'foreach' }); dying.step(1);
    expect(dying.snapshot().status).toBe('lost'); expect(dying.snapshot().foreachFlights).toHaveLength(0);
    expect(unit(dying, 'robot-melee').hp).toBe(1000);
    const disposed = new BattleSession({ runId: 4, stage: quiet(), ...options });
    disposed.dispatch({ type: 'skill', skill: 'foreach' }); disposed.dispose(); disposed.step(2);
    expect(disposed.snapshot().foreachFlights).toHaveLength(0);
  });

  it('cancels a landing when an ordinary attack kills the hero on the same step and clears every pending mechanism', () => {
    const definitions = defs(); definitions.judge.range = 1000; definitions.firefighter.range = 600;
    definitions['robot-ranged'] = { ...definitions['robot-ranged'], range: 1000, damage: 1000, projectileSpeed: undefined };
    const travel = 260 / 86;
    const session = new BattleSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }, { at: travel + .695, kind: 'robot-ranged' }] }), unitDefinitions: definitions, ...options });
    session.dispatch({ type: 'move', direction: 1 }); session.step(travel); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'skill', skill: 'foreach' }); session.dispatch({ type: 'summon', kind: 'firefighter' });
    for (let tick = 0; tick < 20; tick++) session.step(1 / 60);
    session.dispatch({ type: 'summon', kind: 'judge' });
    for (let tick = 20; tick < 41; tick++) session.step(1 / 60);
    expect(session.snapshot().status).toBe('active');
    expect(session.snapshot().foreachFlights).toHaveLength(1);
    expect(session.snapshot().judgeAttacks).toHaveLength(1);
    expect(session.snapshot().waterChannels).toHaveLength(1);
    const before = unit(session, 'robot-melee').hp;
    session.step(1 / 60);
    expect(session.snapshot().status).toBe('lost');
    expect(unit(session, 'robot-melee').hp).toBe(before);
    expect(session.snapshot()).toMatchObject({ foreachFlights: [], judgeAttacks: [], waterChannels: [], bossTelegraphs: [] });
    expect(session.snapshot().effects.some(effect => effect.kind === 'foreach-impact')).toBe(false);
  });
});
