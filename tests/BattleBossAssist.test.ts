import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { BOSS, DEFAULT_STAGE, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { BattleCommand, BattleSpeed } from '../src/game/battle/types';

function battle(spawns = [{ at: 0, kind: 'gpt-4o' as const }], assist = true) {
  const definitions = structuredClone(UNIT_DEFINITIONS);
  definitions['gpt-4o'] = { ...definitions['gpt-4o'], speed: 0, damage: 0 };
  return new BattleSession({ runId: 1, bossAssistEnabled: assist, unitDefinitions: definitions,
    stage: { ...DEFAULT_STAGE, initialGold: 100, spawns, repeat: undefined } });
}
const speed = (session: BattleSession, value: BattleSpeed) => session.dispatch({ type: 'set-speed', speed: value });
const assist = (session: BattleSession, enabled: boolean) => session.dispatch({ type: 'set-boss-assist', enabled });
function toGameTime(session: BattleSession, elapsed: number) {
  while (elapsed - session.snapshot().elapsed > 1e-8) {
    const state = session.snapshot();
    session.step(Math.min(1 / 60, elapsed - state.elapsed) / state.effectiveSpeed);
  }
}

describe('boss warning speed protection', () => {
  it.each([1, 2, 3] as BattleSpeed[])('keeps selected %sx and slows only the live warning, then restores that selection', selected => {
    const session = battle(); speed(session, selected);
    expect(session.snapshot()).toMatchObject({ speed: selected, effectiveSpeed: selected, bossAssistEnabled: true, bossAssistActive: false });
    toGameTime(session, BOSS.firstCastDelay + 1 / 60);
    const warning = session.snapshot(); expect(warning.bossTelegraphs).toHaveLength(1);
    expect(warning).toMatchObject({ speed: selected, effectiveSpeed: 1, bossAssistActive: selected > 1 });
    const remaining = warning.bossTelegraphs[0].remaining;
    session.step(remaining - .01);
    expect(session.snapshot().bossTelegraphs).toHaveLength(1);
    session.step(.01);
    expect(session.snapshot()).toMatchObject({ speed: selected, effectiveSpeed: selected, bossAssistActive: false, bossTelegraphs: [] });
    expect(session.snapshot().effects.filter(effect => effect.kind === 'boss-blast')).toHaveLength(1);
  });

  it('charges a large real frame across onset and expiry using the same clock as small real frames', () => {
    const large = battle(), small = battle();
    for (const session of [large, small]) {
      speed(session, 3); session.dispatch({ type: 'skill', skill: 'hello-world' }); session.dispatch({ type: 'summon', kind: 'melee' });
    }
    large.step(4);
    for (let tick = 0; tick < 240; tick++) small.step(1 / 60);
    // Two real seconds reach sim6; the 1.4s warning then uses wall time;
    // the last .6 real seconds advance 1.8 sim seconds. No frame-wide 3x multiplier.
    expect(large.snapshot().elapsed).toBeCloseTo(9.2, 7);
    expect(small.snapshot().elapsed).toBeCloseTo(large.snapshot().elapsed, 7);
    expect(small.snapshot().gold).toBeCloseTo(large.snapshot().gold, 7);
    expect(small.snapshot().hero).toEqual(large.snapshot().hero);
    expect(small.snapshot().summonCooldowns).toEqual(large.snapshot().summonCooldowns);
    expect(small.snapshot().skillCooldowns).toEqual(large.snapshot().skillCooldowns);
    expect(large.snapshot()).toMatchObject({ speed: 3, effectiveSpeed: 3, bossAssistActive: false, bossTelegraphs: [] });
  });

  it('gives the actual 80-damage warning its full 1.4 real seconds at 3x and restores a later 2x request', () => {
    const session = battle();
    session.dispatch({ type: 'move', direction: 1 }); session.step(340 / 86); session.dispatch({ type: 'move', direction: 0 });
    expect(session.snapshot().hero.x).toBeCloseTo(450);
    speed(session, 3); session.step((BOSS.firstCastDelay - session.snapshot().elapsed) / 3);
    expect(session.snapshot()).toMatchObject({ speed: 3, effectiveSpeed: 1, bossAssistActive: true });
    expect(session.snapshot().bossTelegraphs[0].remaining).toBeCloseTo(BOSS.windup);
    speed(session, 2); session.step(BOSS.windup - .01);
    expect(session.snapshot().hero.hp).toBe(320);
    expect(session.snapshot().bossTelegraphs).toHaveLength(1);
    session.step(.01);
    expect(session.snapshot().hero.hp).toBe(320 - BOSS.damage);
    expect(session.snapshot()).toMatchObject({ speed: 2, effectiveSpeed: 2, bossAssistActive: false, bossTelegraphs: [] });
  });

  it('accounts for overlapping warnings as one continuous protected interval in a large real frame', () => {
    const spawns = [{ at: 0, kind: 'gpt-4o' as const }, { at: 1, kind: 'gpt-4o' as const }];
    const large = battle(spawns), small = battle(spawns); speed(large, 3); speed(small, 3);
    large.step(6);
    for (let tick = 0; tick < 360; tick++) small.step(1 / 60);
    expect(large.snapshot().elapsed).toBeGreaterThan(13);
    expect(large.snapshot().elapsed).toBeLessThan(13.4);
    expect(small.snapshot().elapsed).toBeCloseTo(large.snapshot().elapsed, 7);
    expect(small.snapshot().units.map(unit => unit.bossCooldown)).toEqual(large.snapshot().units.map(unit => unit.bossCooldown));
    expect(large.snapshot()).toMatchObject({ speed: 3, effectiveSpeed: 3, bossAssistActive: false, bossTelegraphs: [] });
  });

  it('allows free speed/assist changes while warning or paused, retaining the latest request', () => {
    const session = battle(); speed(session, 3); toGameTime(session, 6.1);
    let before = session.snapshot(); speed(session, 2);
    expect(session.snapshot()).toEqual({ ...before, speed: 2 });
    before = session.snapshot(); assist(session, false);
    expect(session.snapshot()).toEqual({ ...before, effectiveSpeed: 2, bossAssistEnabled: false, bossAssistActive: false });
    assist(session, true); session.setPaused(true); before = session.snapshot();
    session.step(20); expect(session.snapshot()).toEqual(before);
    speed(session, 1);
    expect(session.snapshot()).toEqual({ ...before, speed: 1, effectiveSpeed: 1, bossAssistActive: false });
    speed(session, 3); expect(session.snapshot().bossAssistActive).toBe(true);
    assist(session, false); expect(session.snapshot().effectiveSpeed).toBe(3);
    assist(session, true); session.setPaused(false);
    const remaining = session.snapshot().bossTelegraphs[0].remaining;
    session.step(remaining);
    expect(session.snapshot()).toMatchObject({ speed: 3, effectiveSpeed: 3, bossAssistActive: false });
  });

  it('preserves protection over staggered overlapping owners until the last warning expires', () => {
    const session = battle([{ at: 0, kind: 'gpt-4o' }, { at: 1, kind: 'gpt-4o' }]); speed(session, 3);
    toGameTime(session, 7.1);
    expect(session.snapshot().bossTelegraphs).toHaveLength(2);
    speed(session, 2); toGameTime(session, 7.5);
    expect(session.snapshot()).toMatchObject({ effectiveSpeed: 1, bossAssistActive: true });
    expect(session.snapshot().bossTelegraphs).toHaveLength(1);
    toGameTime(session, 8.5);
    expect(session.snapshot()).toMatchObject({ speed: 2, effectiveSpeed: 2, bossAssistActive: false, bossTelegraphs: [] });
  });

  it('keeps an independent owner protected after the first is killed and restores speed immediately after the last dies', () => {
    const definitions = structuredClone(UNIT_DEFINITIONS);
    definitions['gpt-4o'] = { ...definitions['gpt-4o'], speed: 0, damage: 0 };
    definitions.ranged = { ...definitions.ranged, speed: 0, range: 1000, damage: 2000, projectileSpeed: 100000, attackInterval: 100, cost: 0, summonCooldown: 0 };
    const session = new BattleSession({ runId: 1, unitDefinitions: definitions,
      stage: { ...DEFAULT_STAGE, spawns: [{ at: 0, kind: 'gpt-4o' }, { at: 1, kind: 'gpt-4o' }], repeat: undefined } });
    speed(session, 3); toGameTime(session, 7.05);
    const owners = session.snapshot().bossTelegraphs.map(warning => warning.ownerId);
    expect(owners).toHaveLength(2);
    session.dispatch({ type: 'summon', kind: 'ranged' }); session.step(2 / 60);
    expect(session.snapshot().bossTelegraphs.map(warning => warning.ownerId)).toEqual([owners[1]]);
    expect(session.snapshot()).toMatchObject({ speed: 3, effectiveSpeed: 1, bossAssistActive: true });
    speed(session, 2); session.dispatch({ type: 'summon', kind: 'ranged' }); session.step(2 / 60);
    expect(session.snapshot()).toMatchObject({ status: 'active', speed: 2, effectiveSpeed: 2, bossAssistActive: false, bossTelegraphs: [], defeatedBossCount: 2 });
  });

  it('allows explicit raw-speed replay opt-out and starts each new session with protection enabled', () => {
    const session = battle(undefined, false); speed(session, 3); session.step(2.1);
    expect(session.snapshot()).toMatchObject({ elapsed: expect.any(Number), speed: 3, effectiveSpeed: 3, bossAssistEnabled: false, bossAssistActive: false });
    expect(session.snapshot().elapsed).toBeCloseTo(6.3);
    expect(session.snapshot().bossTelegraphs).toHaveLength(1);
    session.step(BOSS.windup / 3); expect(session.snapshot().bossTelegraphs).toHaveLength(0);
    expect(new BattleSession({ runId: 2 }).snapshot()).toMatchObject({ speed: 1, effectiveSpeed: 1, bossAssistEnabled: true, bossAssistActive: false });
  });

  it('rejects malformed toggles and ignores invalid deltas without changing any clock or funds', () => {
    const session = battle(); speed(session, 3); toGameTime(session, 6.1);
    for (const invalid of [undefined, null, 0, 1, 'false']) {
      const before = session.snapshot();
      expect(session.dispatch({ type: 'set-boss-assist', enabled: invalid } as unknown as BattleCommand).accepted).toBe(false);
      expect(session.snapshot()).toEqual(before);
    }
    for (const delta of [0, -1, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      const before = session.snapshot(); session.step(delta); expect(session.snapshot()).toEqual(before);
    }
  });

  it('never leaves active protection after defeat/disposal and rejects late commands', () => {
    const definitions = structuredClone(UNIT_DEFINITIONS);
    definitions['gpt-4o'] = { ...definitions['gpt-4o'], speed: 0, damage: 0 };
    definitions['robot-melee'] = { ...definitions['robot-melee'], speed: 0, range: 1000, damage: 10000 };
    const session = new BattleSession({ runId: 1, unitDefinitions: definitions,
      stage: { ...DEFAULT_STAGE, spawns: [{ at: 0, kind: 'gpt-4o' }, { at: 6.1, kind: 'robot-melee' }], repeat: undefined } });
    speed(session, 3); toGameTime(session, 6.05); expect(session.snapshot().bossAssistActive).toBe(true);
    session.step(.1);
    expect(session.snapshot()).toMatchObject({ status: 'lost', effectiveSpeed: 3, bossAssistActive: false, bossTelegraphs: [] });
    const ended = session.snapshot(); expect(assist(session, false).accepted).toBe(false); session.step(10); expect(session.snapshot()).toEqual(ended);
    const disposed = battle(); speed(disposed, 3); toGameTime(disposed, 6.1); disposed.dispose();
    const before = disposed.snapshot(); expect(before.bossAssistActive).toBe(false); expect(assist(disposed, false).accepted).toBe(false);
    disposed.step(10); expect(disposed.snapshot()).toEqual(before);
  });
});
