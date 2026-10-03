import { describe, expect, it } from 'vitest';
import { BattleSession, getCooldownEta, getPushDestination } from '../src/game/BattleSession';
import { DEFAULT_STAGE, DEFAULT_UNLOCKED_SKILLS, SKILLS, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { SkillKind, StageDefinition, UnitDefinition, UnitKind } from '../src/game/battle/types';

const quietStage = (patch: Partial<StageDefinition> = {}): StageDefinition => ({ ...DEFAULT_STAGE, initialGold: 400, spawns: [], repeat: undefined, ...patch });
const definitions = (): Record<UnitKind, UnitDefinition> => structuredClone(UNIT_DEFINITIONS);
const allSkills: SkillKind[] = [...DEFAULT_UNLOCKED_SKILLS, 'git-push'];

describe('authoritative skill unlocks and git push', () => {
  it('defaults to the free skills, rejects a locked command without cost, and keeps unlock DTOs isolated', () => {
    const session = new BattleSession({ runId: 1, stage: quietStage() });
    expect(session.snapshot().unlockedSkills).toEqual(DEFAULT_UNLOCKED_SKILLS);
    const before = session.snapshot();
    (before.unlockedSkills as SkillKind[]).push('git-push');
    expect(session.dispatch({ type: 'skill', skill: 'git-push' }).accepted).toBe(false);
    expect(session.snapshot().gold).toBe(400);
    expect(session.snapshot().skillCooldowns['git-push']).toBe(0);
    expect(session.dispatch({ type: 'skill', skill: 'overclock' }).accepted).toBe(true);
    const supplied: SkillKind[] = [...allSkills];
    const unlocked = new BattleSession({ runId: 2, stage: quietStage(), unlockedSkills: supplied });
    supplied.pop();
    expect(unlocked.dispatch({ type: 'skill', skill: 'git-push' }).accepted).toBe(true);
    expect(unlocked.snapshot()).toMatchObject({ gold: 320, skillCooldowns: { 'git-push': 12 } });
    expect(unlocked.dispatch({ type: 'skill', skill: 'git-push' }).accepted).toBe(false);
    expect(unlocked.snapshot().gold).toBe(320);
  });

  it('pushes each in-range enemy by its own body width, preserves HP and timers, and leaves allies/outside enemies alone', () => {
    const defs = definitions();
    for (const kind of ['robot-melee', 'robot-ranged', 'robot-runner', 'gpt-4o'] as const) defs[kind] = { ...defs[kind], speed: 80, damage: 0, range: 0 };
    const session = new BattleSession({ runId: 1, unlockedSkills: allSkills, unitDefinitions: defs, stage: quietStage({ spawns: [
      { at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-ranged' }, { at: 0, kind: 'robot-runner' }, { at: 0, kind: 'gpt-4o' }, { at: 5, kind: 'robot-melee' },
    ] }) });
    session.dispatch({ type: 'summon', kind: 'melee' });
    session.step(3);
    session.dispatch({ type: 'move', direction: 1 }); session.step(180 / 86); session.dispatch({ type: 'move', direction: 0 });
    const before = session.snapshot();
    expect(before.units.filter(unit => unit.team === 'ai' && Math.abs(unit.x - before.hero.x) <= SKILLS['git-push'].radius)).toHaveLength(4);
    session.dispatch({ type: 'skill', skill: 'git-push' });
    const after = session.snapshot();
    for (const unit of before.units) {
      const moved = after.units.find(candidate => candidate.id === unit.id)!;
      const inRange = unit.team === 'ai' && Math.abs(unit.x - before.hero.x) <= SKILLS['git-push'].radius;
      expect(moved.x - unit.x).toBeCloseTo(inRange ? unit.bodyWidth * (unit.kind === 'gpt-4o' ? 1 : 3) : 0);
      expect({ ...moved, x: unit.x }).toEqual(unit);
    }
    expect(after.effects).toContainEqual(expect.objectContaining({ kind: 'git-push', x: before.hero.x, radius: 120 }));
  });

  it('clamps an enemy right edge to the AI base boundary, never pulls an already farther target left, and keeps a boss warning locked', () => {
    expect(getPushDestination({ x: 550, bodyWidth: 32, kind: 'robot-melee' })).toBe(569);
    expect(getPushDestination({ x: 550, bodyWidth: 64, kind: 'gpt-4o' })).toBe(553);
    expect(getPushDestination({ x: 600, bodyWidth: 32, kind: 'robot-melee' })).toBe(600);
    const defs = definitions(); defs['gpt-4o'] = { ...defs['gpt-4o'], speed: 0, damage: 0 };
    const session = new BattleSession({ runId: 1, stage: quietStage({ spawns: [{ at: 0, kind: 'gpt-4o' }, { at: 0, kind: 'robot-melee' }] }), unlockedSkills: allSkills, unitDefinitions: defs });
    session.dispatch({ type: 'move', direction: 1 }); session.step(340 / 86); session.dispatch({ type: 'move', direction: 0 });
    session.step(6 - session.snapshot().elapsed);
    const warning = session.snapshot().bossTelegraphs[0];
    session.dispatch({ type: 'skill', skill: 'git-push' });
    expect(session.snapshot().units[0].x).toBe(553);
    expect(session.snapshot().bossTelegraphs[0]).toEqual(warning);
    for (const unit of session.snapshot().units) expect(unit.x + unit.bodyWidth / 2).toBeLessThanOrEqual(session.snapshot().aiBase.x);
    session.step(1.41);
    expect(session.snapshot().effects).toContainEqual(expect.objectContaining({ kind: 'boss-blast', x: warning.x }));
  });

  it('does not start a paid skill when funds are insufficient', () => {
    const session = new BattleSession({ runId: 1, stage: quietStage({ initialGold: 70 }), unlockedSkills: allSkills });
    for (const skill of ['git-push', 'overclock'] as const) expect(session.dispatch({ type: 'skill', skill }).accepted).toBe(false);
    expect(session.snapshot()).toMatchObject({ gold: 70, overclockRemaining: 0, skillCooldowns: { 'git-push': 0, overclock: 0 }, effects: [] });
  });
});

describe('overclock base cooldown work', () => {
  it('accelerates already-running and newly-started player cooldowns while its own 30 seconds drain normally', () => {
    const session = new BattleSession({ runId: 1, stage: quietStage() });
    session.dispatch({ type: 'skill', skill: 'hello-world' });
    session.dispatch({ type: 'skill', skill: 'heal' });
    session.dispatch({ type: 'summon', kind: 'support' });
    expect(session.dispatch({ type: 'skill', skill: 'overclock' }).accepted).toBe(true);
    session.step(1);
    expect(session.snapshot()).toMatchObject({ overclockRemaining: expect.closeTo(9), skillCooldowns: { 'hello-world': expect.closeTo(0.5), heal: expect.closeTo(10), overclock: expect.closeTo(29) }, summonCooldowns: { support: expect.closeTo(6) } });
    session.step(0.25);
    expect(session.snapshot().skillCooldowns['hello-world']).toBeCloseTo(0);
    expect(session.dispatch({ type: 'skill', skill: 'hello-world' }).accepted).toBe(true);
    expect(getCooldownEta(session.snapshot().skillCooldowns['hello-world'], session.snapshot().overclockRemaining)).toBe(1.25);
    session.step(1.25);
    expect(session.snapshot().skillCooldowns['hello-world']).toBeCloseTo(0);
    expect(session.snapshot().skillCooldowns.overclock).toBeCloseTo(27.5);
    expect(session.dispatch({ type: 'skill', skill: 'overclock' }).accepted).toBe(false);
  });

  it('splits work exactly at a fractional expiry and restores normal cooldowns afterwards', () => {
    const session = new BattleSession({ runId: 1, stage: quietStage() });
    session.dispatch({ type: 'skill', skill: 'overclock' });
    session.step(9.995);
    session.dispatch({ type: 'skill', skill: 'hello-world' });
    expect(getCooldownEta(2.5, session.snapshot().overclockRemaining)).toBeCloseTo(2.495);
    session.step(1);
    expect(session.snapshot().overclockRemaining).toBe(0);
    expect(session.snapshot().skillCooldowns['hello-world']).toBeCloseTo(1.495);
    expect(session.snapshot().skillCooldowns.overclock).toBeCloseTo(19.005);
    session.step(1.5);
    expect(session.dispatch({ type: 'skill', skill: 'hello-world' }).accepted).toBe(true);
    session.step(1);
    expect(session.snapshot().skillCooldowns['hello-world']).toBeCloseTo(1.5);
    expect(getCooldownEta(5, 2)).toBe(3);
    expect(getCooldownEta(5, 3)).toBe(2.5);
    expect(getCooldownEta(30, 10, true)).toBe(30);
  });

  it('leaves income and NPC attacks unchanged', () => {
    const defs = definitions(); defs['robot-melee'] = { ...defs['robot-melee'], speed: 0, damage: 1, range: 1000, attackInterval: 1 };
    const stage = quietStage({ initialGold: 200, spawns: [{ at: 0, kind: 'robot-melee' }] });
    const normal = new BattleSession({ runId: 1, stage, unitDefinitions: defs });
    const boosted = new BattleSession({ runId: 2, stage, unitDefinitions: defs });
    boosted.dispatch({ type: 'skill', skill: 'overclock' });
    for (const session of [normal, boosted]) session.step(10);
    expect(boosted.snapshot().gold).toBeCloseTo(280);
    expect(normal.snapshot().gold - boosted.snapshot().gold).toBeCloseTo(SKILLS.overclock.cost);
    expect(boosted.snapshot().hero.hp).toBe(normal.snapshot().hero.hp);
    expect(boosted.snapshot().units[0].attackCooldown).toBeCloseTo(normal.snapshot().units[0].attackCooldown);
  });

  it('freezes on pause, clears on disposal/restart, and stops on battle completion', () => {
    const session = new BattleSession({ runId: 1, stage: quietStage() });
    session.dispatch({ type: 'skill', skill: 'overclock' }); session.step(0.3); session.setPaused(true);
    const paused = session.snapshot(); session.step(40); expect(session.snapshot()).toEqual(paused);
    session.dispose(); expect(session.snapshot().overclockRemaining).toBe(0);
    expect(new BattleSession({ runId: 2, stage: quietStage() }).snapshot()).toMatchObject({ overclockRemaining: 0, skillCooldowns: { overclock: 0 } });
    const defs = definitions(); defs.ranged = { ...defs.ranged, damage: 1000, speed: 0, range: 1000, projectileSpeed: 10000 };
    const winner = new BattleSession({ runId: 3, stage: quietStage(), unitDefinitions: defs });
    winner.dispatch({ type: 'skill', skill: 'overclock' }); winner.dispatch({ type: 'summon', kind: 'ranged' }); winner.step(0.2);
    expect(winner.snapshot()).toMatchObject({ status: 'won', overclockRemaining: 0 });
    expect(winner.dispatch({ type: 'skill', skill: 'overclock' }).accepted).toBe(false);
  });
});
