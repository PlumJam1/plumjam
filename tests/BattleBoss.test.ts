import { describe, expect, it } from 'vitest';
import { BattleSession, getSkillValues } from '../src/game/BattleSession';
import { BOSS, DEFAULT_STAGE, SKILLS, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { BossTelegraphState, StageDefinition, UnitDefinition, UnitKind } from '../src/game/battle/types';
import { STAGES } from '../src/game/progression/stages';

const quietBossStage = (patch: Partial<StageDefinition> = {}): StageDefinition => ({ ...DEFAULT_STAGE, initialGold: 400, spawns: [{ at: 0, kind: 'gpt-4o' }], repeat: undefined, ...patch });
const definitions = (): Record<UnitKind, UnitDefinition> => {
  const defs = structuredClone(UNIT_DEFINITIONS);
  defs['gpt-4o'] = { ...defs['gpt-4o'], speed: 0, damage: 0 };
  return defs;
};
const approach = (session: BattleSession, x = 450) => {
  session.dispatch({ type: 'move', direction: 1 });
  session.step((x - 110) / 86);
  session.dispatch({ type: 'move', direction: 0 });
};

describe('GPT-4o locked frontal area attack', () => {
  it('warns before one blast, stops moving while casting, and hits every human in the locked area', () => {
    const defs = definitions();
    defs.melee = { ...defs.melee, damage: 0, speed: 65, range: 100 };
    defs.ranged = { ...defs.ranged, damage: 0, speed: 0 };
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: quietBossStage(), unitDefinitions: defs });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.dispatch({ type: 'summon', kind: 'ranged' });
    approach(session);
    session.step(BOSS.firstCastDelay - session.snapshot().elapsed);
    const warning = session.snapshot();
    expect(warning.bossTelegraphs).toEqual([{ ownerId: warning.units[0].id, x: 450, radius: 80, duration: 1.4, remaining: 1.4 }]);
    expect(warning.hero.hp).toBe(320);
    session.step(1.3);
    expect(session.snapshot().hero.hp).toBe(320);
    expect(session.snapshot().units[0].x).toBe(warning.units[0].x);
    session.step(0.11);
    const blasted = session.snapshot();
    expect(blasted.bossTelegraphs).toHaveLength(0);
    expect(blasted.hero.hp).toBe(240);
    expect(blasted.units.find(unit => unit.kind === 'melee')?.hp).toBe(UNIT_DEFINITIONS.melee.hp - BOSS.damage);
    expect(blasted.units.find(unit => unit.kind === 'ranged')?.hp).toBe(90);
    expect(blasted.humanBase.hp).toBe(900);
    expect(blasted.effects).toEqual([expect.objectContaining({ kind: 'boss-blast', x: 450, radius: 80 })]);
    session.step(2);
    expect(session.snapshot().hero.hp).toBe(240);
    expect(session.snapshot().bossTelegraphs).toHaveLength(0);
    session.step(15 - session.snapshot().elapsed);
    expect(session.snapshot().bossTelegraphs).toHaveLength(1);
    expect(session.snapshot().bossTelegraphs[0].remaining).toBeCloseTo(BOSS.windup);
  });

  it('allows a hero to dodge during the windup while sleep leaves the cast timer running', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: quietBossStage(), unitDefinitions: definitions() });
    approach(session);
    session.step(6 - session.snapshot().elapsed);
    session.dispatch({ type: 'skill', skill: 'sleep' });
    expect(session.snapshot().units[0].slowRemaining).toBe(5);
    session.dispatch({ type: 'move', direction: -1 });
    session.step(1.41);
    expect(session.snapshot().hero.x).toBeLessThan(370);
    expect(session.snapshot().hero.hp).toBe(320);
    expect(session.snapshot().effects.some(effect => effect.kind === 'boss-blast')).toBe(true);
    expect(session.snapshot().bossTelegraphs).toHaveLength(0);
  });

  it('freezes all boss clocks on pause, copies its DTOs, and resets casts on disposal and restart', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: quietBossStage(), unitDefinitions: definitions() });
    session.step(6.4);
    session.setPaused(true);
    const paused = session.snapshot();
    session.step(30);
    expect(session.snapshot()).toEqual(paused);
    (paused.bossTelegraphs[0] as BossTelegraphState).remaining = 0;
    (paused.units[0] as { bossCooldown: number }).bossCooldown = 0;
    expect(session.snapshot().bossTelegraphs[0].remaining).toBeCloseTo(1);
    expect(session.snapshot().units[0].bossCooldown).toBeCloseTo(8.6);
    session.dispose();
    expect(session.snapshot().bossTelegraphs).toHaveLength(0);
    const fresh = new BattleSession({ runId: 2, stage: quietBossStage(), unitDefinitions: definitions() });
    expect(fresh.snapshot()).toMatchObject({ defeatedBossCount: 0, bossTelegraphs: [] });
    expect(fresh.snapshot().units[0].bossCooldown).toBe(BOSS.firstCastDelay);
  });

  it('cancels a dying owner before detonation and records one defeat without a blast effect', () => {
    const defs = definitions(); defs['gpt-4o'].hp = 60;
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: quietBossStage(), unitDefinitions: defs });
    approach(session);
    session.step(6.95 - session.snapshot().elapsed);
    session.dispatch({ type: 'skill', skill: 'hello-world' });
    session.step(0.45);
    expect(session.snapshot()).toMatchObject({ defeatedBossCount: 1, bossTelegraphs: [], hero: { hp: 320 } });
    expect(session.snapshot().effects.some(effect => effect.kind === 'boss-blast')).toBe(false);
    session.step(10);
    expect(session.snapshot().defeatedBossCount).toBe(1);
    expect(session.snapshot().hero.hp).toBe(320);
  });

  it('clears a pending cast when a public hero shot destroys the enemy base', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: quietBossStage({ aiBaseHp: 75 }), unitDefinitions: definitions() });
    approach(session);
    session.step(6 - session.snapshot().elapsed);
    session.dispatch({ type: 'move', direction: 1 });
    session.step(110 / 86);
    session.dispatch({ type: 'move', direction: 0 });
    expect(session.snapshot().bossTelegraphs).toHaveLength(1);
    expect(session.snapshot().status).toBe('active');
    session.dispatch({ type: 'skill', skill: 'hello-world' });
    session.step(0.1);
    expect(session.snapshot().status).toBe('won');
    expect(session.snapshot().bossTelegraphs).toHaveLength(0);
    expect(session.snapshot().effects.some(effect => effect.kind === 'boss-blast')).toBe(false);
  });

  it('hits the base and the inclusive radius boundary, then clears warnings on base defeat', () => {
    const defs = definitions();
    defs['gpt-4o'] = { ...defs['gpt-4o'], speed: 100, range: 20 };
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: quietBossStage({ humanBaseHp: 60 }), unitDefinitions: defs });
    session.dispatch({ type: 'move', direction: -1 });
    session.step(6);
    session.dispatch({ type: 'move', direction: 0 });
    expect(session.snapshot().hero.x).toBe(80);
    expect(session.snapshot().bossTelegraphs[0].x).toBeCloseTo(0);
    session.step(1.41);
    expect(session.snapshot()).toMatchObject({ status: 'lost', defeatReason: 'base', humanBase: { hp: 0 }, hero: { hp: 240 }, bossTelegraphs: [] });
  });
});

describe('skill values and authored rushes', () => {
  it('uses the same hero level without service-worker attack-speed buffs affecting skills in preview and actual projectile damage', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: { ...quietBossStage(), spawns: [] }, levels: { hero: 5 }, random: () => 0.5 });
    session.dispatch({ type: 'summon', kind: 'support' });
    session.step(5.01);
    const values = getSkillValues(session.snapshot().hero);
    expect(values.helloDamage).toBeCloseTo(SKILLS['hello-world'].damage * 1.6);
    expect(values.healAmount).toBeCloseTo(SKILLS.heal.amount * 1.6);
    expect(values).toMatchObject({ helloRange: 350, sleepRadius: 120, sleepDuration: 5, sleepSpeedMultiplier: 0.4, healRadius: 110 });
    session.dispatch({ type: 'skill', skill: 'hello-world' });
    expect(session.snapshot().projectiles[0].damage).toBe(values.helloDamage);
  });

  it('lets one starter Hello World shot defeat a runner and sleep meaningfully delays its fast advance', () => {
    const make = () => new BattleSession({ runId: 1, unlockedSkills: ['hello-world', 'sleep'], stage: { ...quietBossStage(), spawns: [{ at: 0, kind: 'robot-runner' }] } });
    const shot = make();
    shot.dispatch({ type: 'move', direction: 1 }); shot.step(2); shot.dispatch({ type: 'move', direction: 0 });
    shot.dispatch({ type: 'skill', skill: 'hello-world' }); shot.step(1);
    expect(shot.snapshot().units).toHaveLength(0);
    const slow = make(), normal = make();
    for (const session of [slow, normal]) { session.dispatch({ type: 'move', direction: 1 }); session.step(2.4); session.dispatch({ type: 'move', direction: 0 }); }
    expect(slow.dispatch({ type: 'skill', skill: 'sleep' }).accepted).toBe(true);
    slow.step(1); normal.step(1);
    expect(slow.snapshot().units[0].x - normal.snapshot().units[0].x).toBeCloseTo(52 * 0.6);
  });

  it('keeps the introduction unchanged and orders announced runner bursts before endless pressure', () => {
    expect(STAGES[0].spawns.every(spawn => spawn.kind !== 'robot-runner')).toBe(true);
    for (const [index, count] of [[1, 3], [4, 3]] as const) {
      const stage = STAGES[index];
      const runners = stage.spawns.filter(spawn => spawn.kind === 'robot-runner');
      expect(runners).toHaveLength(count);
      expect(runners.at(-1)!.at - runners[0].at).toBeLessThanOrEqual(1.5);
      expect(stage.waveNotices![0].at).toBe(runners[0].at - 2);
      expect(stage.waveNotices![0].at + stage.waveNotices![0].duration).toBeGreaterThan(runners.at(-1)!.at);
      expect(stage.spawns.every((spawn, i) => i === 0 || spawn.at >= stage.spawns[i - 1].at)).toBe(true);
    }
  });
});
