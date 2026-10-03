import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { UNIT_DEFINITIONS, WATER } from '../src/game/battle/balance';
import type { BattleSpeed } from '../src/game/battle/types';

function spacedBattle() {
  const definitions = structuredClone(UNIT_DEFINITIONS);
  // Keep everyone alive to isolate real travel, engagement and beam geometry.
  // Movement speeds and attack ranges remain the actual gameplay definitions.
  definitions.melee = { ...definitions.melee, hp: 100000, damage: 0 };
  for (const kind of ['robot-melee', 'robot-ranged'] as const) definitions[kind] = { ...definitions[kind], hp: 100000, damage: 0 };
  const battle = new BattleSession({ runId: 1,
    stage: { id: 'water-spacing', label: 'Water spacing', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400,
      spawns: [{ at: 0, kind: 'robot-melee' }, { at: 10, kind: 'robot-ranged' }] },
    unitDefinitions: definitions, unlockedAllies: ['melee', 'firefighter'], equippedAllies: ['melee', 'firefighter'] });
  battle.dispatch({ type: 'summon', kind: 'melee' }); battle.dispatch({ type: 'summon', kind: 'firefighter' });
  for (let tick = 0; tick < 30 * 60; tick++) {
    battle.step(1 / 60);
    const state = battle.snapshot();
    if (state.elapsed > 18 && state.waterChannels[0]?.remaining === WATER.duration) return battle;
  }
  throw new Error('The spaced formation did not begin a full water channel');
}

describe('firefighter back-line coverage at native engagement ranges', () => {
  it('keeps the acquired hose direction for the whole channel when a pushed target crosses the source', () => {
    const battle = new BattleSession({ runId: 1,
      stage: { id: 'water-direction', label: 'Locked hose direction', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400,
        spawns: [{ at: 0, kind: 'robot-melee' }] },
      unlockedAllies: ['firefighter'], equippedAllies: ['firefighter'], unlockedSkills: ['git-push'], equippedSkills: ['git-push'] });
    battle.dispatch({ type: 'move', direction: -1 }); battle.step(.4);
    battle.dispatch({ type: 'move', direction: 0 }); battle.step(21);
    battle.dispatch({ type: 'move', direction: 1 }); battle.step(4);
    battle.dispatch({ type: 'move', direction: -1 }); battle.step(4);
    battle.dispatch({ type: 'move', direction: 0 });
    expect(battle.snapshot().hero.x).toBeCloseTo(80);
    expect(battle.snapshot().units[0]!.x).toBeCloseTo(75);
    battle.dispatch({ type: 'summon', kind: 'firefighter' }); battle.step(.001);
    const channel = battle.snapshot().waterChannels[0]!;
    expect(channel.endX).toBeLessThan(channel.x);
    battle.dispatch({ type: 'skill', skill: 'git-push' }); battle.step(.5);
    expect(battle.snapshot().units.find(unit => unit.team === 'ai')!.x).toBeGreaterThan(channel.x);
    expect(battle.snapshot().waterChannels[0]!.endX).toBe(channel.endX);
    battle.step(.5);
    expect(battle.snapshot().units.find(unit => unit.team === 'ai')!.hp).toBe(UNIT_DEFINITIONS['robot-melee'].hp);
    expect(battle.snapshot().waterChannels).toHaveLength(0);
    for (let tick = 0; tick < 2 * 60; tick++) {
      battle.step(1 / 60);
      if (battle.snapshot().waterChannels.length) break;
    }
    const reacquired = battle.snapshot().waterChannels[0]!;
    expect(reacquired.endX).toBeGreaterThan(reacquired.x);
  });

  it('aims a late defensive channel at an enemy behind its spawn without changing movement or damage ticks', () => {
    const battle = new BattleSession({ runId: 1,
      stage: { id: 'water-defence', label: 'Late defensive channel', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400,
        spawns: [{ at: 0, kind: 'robot-melee' }] },
      unlockedAllies: ['firefighter'], equippedAllies: ['firefighter'] });
    // These are ordinary commands with untouched gameplay definitions: draw the robot
    // toward the hero, then move away so it chooses the nearer base at x55.
    battle.dispatch({ type: 'move', direction: -1 }); battle.step(.4);
    battle.dispatch({ type: 'move', direction: 0 }); battle.step(21);
    battle.dispatch({ type: 'move', direction: 1 }); battle.step(4);
    battle.dispatch({ type: 'move', direction: 0 });
    const before = battle.snapshot(); const enemy = before.units[0]!;
    expect(before.status).toBe('active'); expect(before.hero.x).toBeCloseTo(424);
    expect(enemy.x).toBeCloseTo(75); expect(before.humanBase.hp).toBeLessThan(before.humanBase.maxHp);
    expect(battle.dispatch({ type: 'summon', kind: 'firefighter' }).accepted).toBe(true);
    battle.step(.001);
    const channel = battle.snapshot().waterChannels[0]!;
    expect(channel.x).toBe(85);
    expect(channel.endX).toBe(85 - UNIT_DEFINITIONS.firefighter.range - WATER.extraReach);
    expect(channel.endX).toBeLessThan(enemy.x);
    expect(channel).not.toHaveProperty('direction');
    for (let tick = 1; tick <= 4; tick++) {
      battle.step(.25);
      expect(enemy.hp - battle.snapshot().units.find(unit => unit.id === enemy.id)!.hp).toBeCloseTo(UNIT_DEFINITIONS.firefighter.damage / WATER.ticks * tick);
      expect(battle.snapshot().units.find(unit => unit.kind === 'firefighter')!.x).toBe(85);
    }
    expect(battle.snapshot().waterChannels).toHaveLength(0);
  });

  it.each([1, 2, 3] as BattleSpeed[])('hits the front but excludes its natural ranged rear 75 behind for four ticks at %sx', speed => {
    const battle = spacedBattle(); const state = battle.snapshot();
    const front = state.units.find(unit => unit.kind === 'robot-melee')!;
    const back = state.units.find(unit => unit.kind === 'robot-ranged')!;
    const source = state.units.find(unit => unit.kind === 'firefighter')!;
    const channel = state.waterChannels[0]!;
    expect(front.x).toBeCloseTo(337); expect(back.x).toBeCloseTo(412);
    expect(back.x - front.x).toBeCloseTo(75);
    // A close hose still reaches the engaged front, but does not sweep its natural ranged rear.
    expect(back.x).toBeGreaterThan(source.x + UNIT_DEFINITIONS.firefighter.range);
    expect(channel.endX).toBeCloseTo(source.x + UNIT_DEFINITIONS.firefighter.range + WATER.extraReach);
    expect(front.x).toBeLessThan(channel.endX);
    expect(back.x).toBeGreaterThan(channel.endX);
    battle.dispatch({ type: 'set-speed', speed });
    battle.step(.249 / speed);
    expect(battle.snapshot().units.find(unit => unit.id === front.id)!.hp).toBe(front.hp);
    expect(battle.snapshot().units.find(unit => unit.id === back.id)!.hp).toBe(back.hp);
    battle.step(.001 / speed);
    for (let tick = 1; tick <= 4; tick++) {
      const current = battle.snapshot();
      expect(front.hp - current.units.find(unit => unit.id === front.id)!.hp).toBeCloseTo(UNIT_DEFINITIONS.firefighter.damage / WATER.ticks * tick);
      expect(current.units.find(unit => unit.id === back.id)!.hp).toBe(back.hp);
      expect(current.units.find(unit => unit.id === source.id)!.x).toBe(source.x);
      if (tick === 1) {
        battle.setPaused(true); const paused = battle.snapshot(); battle.step(1); expect(battle.snapshot()).toEqual(paused); battle.setPaused(false);
      }
      if (tick < 4) battle.step(.25 / speed);
    }
    expect(battle.snapshot().waterChannels).toHaveLength(0);
  });
  it('still damages two enemies inside its short hose while excluding the nearby base beyond its endpoint', () => {
    const definitions = structuredClone(UNIT_DEFINITIONS);
    definitions['robot-melee'] = { ...definitions['robot-melee'], hp: 1000, damage: 0, speed: 0 };
    const battle = new BattleSession({ runId: 1, unitDefinitions: definitions,
      stage: { id: 'short-water-cluster', label: 'Short hose cluster', initialGold: 200, humanBaseHp: 900, aiBaseHp: 900,
        spawns: [{ at: 0, kind: 'robot-melee' }, { at: 0, kind: 'robot-melee' }] },
      unlockedAllies: ['firefighter'], equippedAllies: ['firefighter'] });
    expect(battle.dispatch({ type: 'summon', kind: 'firefighter' }).accepted).toBe(true);
    for (let tick = 0; tick < 30 * 60 && !battle.snapshot().waterChannels.length; tick++) battle.step(1 / 60);
    const initial = battle.snapshot(); const channel = initial.waterChannels[0]!;
    expect(channel.x).toBeCloseTo(465); expect(channel.endX).toBeCloseTo(580);
    expect(initial.units.filter(unit => unit.team === 'ai').map(unit => unit.x)).toEqual([550, 550]);
    expect(initial.aiBase.x - channel.endX).toBeCloseTo(5);
    for (let tick = 1; tick <= WATER.ticks; tick++) {
      battle.step(WATER.tickInterval);
      expect(battle.snapshot().units.filter(unit => unit.team === 'ai').map(unit => unit.hp))
        .toEqual([1000 - definitions.firefighter.damage / WATER.ticks * tick, 1000 - definitions.firefighter.damage / WATER.ticks * tick]);
      expect(battle.snapshot().aiBase.hp).toBe(initial.aiBase.hp);
    }
    expect(battle.snapshot().waterChannels).toHaveLength(0);
    // Disposing a later live channel removes pending ticks, rather than only an already completed channel.
    for (let tick = 0; tick < 3 * 60 && !battle.snapshot().waterChannels.length; tick++) battle.step(1 / 60);
    expect(battle.snapshot().waterChannels).toHaveLength(1);
    battle.dispose(); const disposed = battle.snapshot(); battle.step(2);
    expect(battle.snapshot()).toEqual(disposed);
    expect(disposed.waterChannels).toHaveLength(0);
  });
});
