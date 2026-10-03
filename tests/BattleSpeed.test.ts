import { describe, expect, it } from 'vitest';
import { BattleSession, type BattleOptions } from '../src/game/BattleSession';
import { BOSS, DEFAULT_STAGE, SKILLS, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { BattleSpeed, SkillKind, StageDefinition } from '../src/game/battle/types';

const quiet = (patch: Partial<StageDefinition> = {}): StageDefinition => ({ ...DEFAULT_STAGE, initialGold: 400, spawns: [], repeat: undefined, ...patch });
// Raw-speed replay equivalence is opt-out; automatic protection has its own real-clock tests.
const rawSpeedSession = (options: BattleOptions) => new BattleSession({ ...options, bossAssistEnabled: false });
const allSkills = Object.keys(SKILLS) as SkillKind[];
const setSpeed = (session: BattleSession, speed: number) => session.dispatch({ type: 'set-speed', speed: speed as BattleSpeed });

describe('one authoritative simulation speed', () => {
  it('advances game time, income and movement at 1/2/3 times wall time and leaves speed selection free', () => {
    for (const speed of [1, 2, 3]) {
      const session = rawSpeedSession({ runId: 1, stage: quiet({ initialGold: 20 }) });
      const before = session.snapshot();
      expect(setSpeed(session, speed).accepted).toBe(true);
      expect(session.snapshot()).toEqual({ ...before, speed, effectiveSpeed: speed });
      session.dispatch({ type: 'move', direction: 1 }); session.step(1);
      expect(session.snapshot().elapsed).toBeCloseTo(speed);
      expect(session.snapshot().gold).toBeCloseTo(20 + 18 * speed);
      expect(session.snapshot().hero.x).toBeCloseTo(110 + 86 * speed);
    }
  });

  it('produces the same entire combat snapshot at the same accumulated game time, including overclock/haste, boss, waves and projectiles', () => {
    const run = (speed: BattleSpeed) => {
      const session = rawSpeedSession({ runId: 1, stage: quiet({ spawns: [
        { at: 0, kind: 'gpt-4o' }, { at: 2, kind: 'robot-runner' }, { at: 6.1, kind: 'robot-ranged' }, { at: 6.15, kind: 'robot-runner' },
      ] }), levels: { hero: 5 }, unlockedSkills: allSkills, equippedSkills: ['hello-world', 'sleep', 'overclock'] });
      setSpeed(session, speed);
      session.dispatch({ type: 'summon', kind: 'support' }); session.dispatch({ type: 'summon', kind: 'melee' });
      session.dispatch({ type: 'skill', skill: 'overclock' }); session.dispatch({ type: 'skill', skill: 'sleep' }); session.dispatch({ type: 'skill', skill: 'hello-world' });
      session.dispatch({ type: 'move', direction: 1 });
      const checkpoints = [];
      for (let tick = 0; tick < 12 * 60; tick++) {
        if (tick === 4 * 60) session.dispatch({ type: 'move', direction: 0 });
        if (tick === 7 * 60) session.dispatch({ type: 'skill', skill: 'hello-world' });
        session.step(1 / 60 / speed);
        if ([0, 5 * 60, 6 * 60 + 12, 7 * 60, 10 * 60].includes(tick)) {
          const { speed: _speed, effectiveSpeed: _effectiveSpeed, ...snapshot } = session.snapshot(); checkpoints.push(snapshot);
        }
      }
      const { speed: _speed, effectiveSpeed: _effectiveSpeed, ...snapshot } = session.snapshot();
      return { snapshot, checkpoints };
    };
    const baseline = run(1);
    expect(baseline.snapshot.elapsed).toBeCloseTo(12);
    expect(baseline.snapshot.status).toBe('active');
    expect(baseline.snapshot.units.some(unit => unit.kind === 'robot-ranged')).toBe(true);
    expect(baseline.snapshot.units.some(unit => unit.buffs.haste > 0)).toBe(true);
    expect(baseline.checkpoints[0].projectiles).toHaveLength(1);
    expect(baseline.checkpoints[0].effects.some(effect => effect.kind === 'sleep')).toBe(true);
    expect(baseline.checkpoints[2].bossTelegraphs).toHaveLength(1);
    expect(run(2)).toEqual(baseline); expect(run(3)).toEqual(baseline);
  });

  it('applies a mid-run change only to future steps, without resetting gold, cooldowns or effects', () => {
    const session = rawSpeedSession({ runId: 1, stage: quiet() });
    session.dispatch({ type: 'skill', skill: 'hello-world' }); session.step(.5);
    const before = session.snapshot(); setSpeed(session, 3);
    expect(session.snapshot()).toEqual({ ...before, speed: 3, effectiveSpeed: 3 });
    session.step(.5);
    expect(session.snapshot().elapsed).toBeCloseTo(2);
    expect(session.snapshot().skillCooldowns['hello-world']).toBeCloseTo(.5);
    setSpeed(session, 1); session.step(.5);
    expect(session.snapshot().elapsed).toBeCloseTo(2.5);
    expect(session.snapshot().skillCooldowns['hello-world']).toBe(0);
  });

  it('rejects invalid factors without side effects and accepts paused selection while every clock stays frozen', () => {
    const session = rawSpeedSession({ runId: 1, stage: quiet(), unlockedSkills: allSkills, equippedSkills: ['overclock', 'sleep', 'git-push'] });
    session.dispatch({ type: 'skill', skill: 'overclock' }); session.step(.3);
    for (const invalid of [0, -1, 1.5, 4, NaN, Infinity, -Infinity]) {
      const before = session.snapshot(); expect(setSpeed(session, invalid).accepted).toBe(false); expect(session.snapshot()).toEqual(before);
    }
    session.setPaused(true); const before = session.snapshot();
    expect(setSpeed(session, 3).accepted).toBe(true); session.step(30);
    expect(session.snapshot()).toEqual({ ...before, speed: 3, effectiveSpeed: 3 });
    expect(session.dispatch({ type: 'summon', kind: 'melee' }).accepted).toBe(false);
    expect(session.dispatch({ type: 'skill', skill: 'sleep' }).accepted).toBe(false);
    session.setPaused(false); session.step(.2);
    expect(session.snapshot().elapsed).toBeCloseTo(.9);
    expect(session.snapshot().overclockRemaining).toBeCloseTo(9.1);
  });

  it('completes the remote linear .45-game-second push in .15 wall seconds at 3x while the warning stays locked', () => {
    const definitions = structuredClone(UNIT_DEFINITIONS);
    definitions['gpt-4o'] = { ...definitions['gpt-4o'], speed: 0, damage: 0 };
    const session = rawSpeedSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'gpt-4o' }] }), unitDefinitions: definitions, unlockedSkills: allSkills, equippedSkills: ['git-push', 'sleep', 'overclock'] });
    session.dispatch({ type: 'move', direction: 1 }); session.step(340 / 86); session.dispatch({ type: 'move', direction: 0 });
    session.step(BOSS.firstCastDelay - session.snapshot().elapsed);
    const warning = session.snapshot().bossTelegraphs[0]; const start = session.snapshot().units[0].x;
    session.dispatch({ type: 'skill', skill: 'git-push' }); setSpeed(session, 3);
    session.step(.075); expect(session.snapshot().units[0].x).toBeCloseTo((start + 553) / 2);
    expect(session.snapshot().bossTelegraphs[0].x).toBe(warning.x);
    session.setPaused(true); session.step(.5); expect(session.snapshot().units[0].x).toBeCloseTo((start + 553) / 2);
    session.setPaused(false); session.step(.075); expect(session.snapshot().units[0].x).toBe(553);
    session.step((BOSS.windup - SKILLS['git-push'].pushDuration + .01) / 3);
    expect(session.snapshot().bossTelegraphs).toHaveLength(0);
    expect(session.snapshot().hero.hp).toBe(240);
    expect(session.snapshot().effects).toContainEqual(expect.objectContaining({ kind: 'boss-blast', x: warning.x }));
  });

  it('retains small collision steps at 3x, stops after defeat/victory/disposal, and starts each new session at 1x', () => {
    const defs = structuredClone(UNIT_DEFINITIONS);
    defs['robot-runner'] = { ...defs['robot-runner'], speed: 0, damage: 0 };
    const session = rawSpeedSession({ runId: 1, stage: quiet({ spawns: [{ at: 0, kind: 'robot-runner' }] }), unitDefinitions: defs });
    setSpeed(session, 3); session.dispatch({ type: 'move', direction: 1 }); session.step(340 / 86 / 3); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'skill', skill: 'hello-world' }); session.step(.2);
    expect(session.snapshot().units).toHaveLength(0);
    session.dispose(); const disposed = session.snapshot();
    expect(setSpeed(session, 1).accepted).toBe(false); session.step(1); expect(session.snapshot()).toEqual(disposed);
    expect(rawSpeedSession({ runId: 2 }).snapshot().speed).toBe(1);
    const winner = rawSpeedSession({ runId: 3, stage: quiet({ aiBaseHp: 75 }) });
    winner.dispatch({ type: 'move', direction: 1 }); winner.step(2); winner.dispatch({ type: 'move', direction: 0 }); setSpeed(winner, 3);
    winner.dispatch({ type: 'skill', skill: 'hello-world' }); winner.step(1);
    expect(winner.snapshot().status).toBe('won'); const won = winner.snapshot();
    expect(setSpeed(winner, 1).accepted).toBe(false); winner.step(5); expect(winner.snapshot()).toEqual(won);
    const lethal = structuredClone(UNIT_DEFINITIONS); lethal['robot-melee'] = { ...lethal['robot-melee'], speed: 0, damage: 1000, range: 1000 };
    const loser = rawSpeedSession({ runId: 4, stage: quiet({ spawns: [{ at: 0, kind: 'robot-melee' }] }), unitDefinitions: lethal });
    setSpeed(loser, 3); loser.step(.1); expect(loser.snapshot().status).toBe('lost');
    const lost = loser.snapshot(); expect(setSpeed(loser, 2).accepted).toBe(false); loser.step(5); expect(loser.snapshot()).toEqual(lost);
  });
});
