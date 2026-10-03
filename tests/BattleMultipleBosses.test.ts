import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { BOSS, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import type { BattleSpeed, BossTelegraphState } from '../src/game/battle/types';

function dualBossBattle(runId = 1, fragile = false) {
  const definitions = structuredClone(UNIT_DEFINITIONS);
  definitions['gpt-4o'] = { ...definitions['gpt-4o'], speed: 0, damage: 0, hp: fragile ? 60 : 1500 };
  return new BattleSession({ runId, unitDefinitions: definitions, bossAssistEnabled: false,
    stage: { id: 'two-bosses', label: 'two boss owners', initialGold: 400, humanBaseHp: 900, aiBaseHp: 900,
      spawns: [{ at: 0, kind: 'gpt-4o' }, { at: .2, kind: 'gpt-4o' }] } });
}
function approach(battle: BattleSession) {
  battle.dispatch({ type: 'move', direction: 1 }); battle.step(340 / 86); battle.dispatch({ type: 'move', direction: 0 });
}

describe('independent GPT-4o owners', () => {
  it.each([1, 2, 3] as BattleSpeed[])('keeps separate warning clocks when the first owner dies at %sx', speed => {
    const battle = dualBossBattle(1, true); approach(battle);
    battle.dispatch({ type: 'set-speed', speed });
    battle.step((BOSS.firstCastDelay + .2 - battle.snapshot().elapsed) / speed);
    const initial = battle.snapshot(); const [first, second] = initial.units;
    expect(initial.bossTelegraphs.map(warning => warning.ownerId)).toEqual([first!.id, second!.id]);
    expect(initial.bossTelegraphs[0]!.remaining).toBeCloseTo(1.2);
    expect(initial.bossTelegraphs[1]!.remaining).toBeCloseTo(1.4);
    battle.setPaused(true); const frozen = battle.snapshot(); battle.step(5); expect(battle.snapshot()).toEqual(frozen); battle.setPaused(false);
    battle.step(.6 / speed);
    battle.dispatch({ type: 'skill', skill: 'hello-world' }); battle.step(.45 / speed);
    expect(battle.snapshot().defeatedBossCount).toBe(1);
    expect(battle.snapshot().units.map(unit => unit.id)).toEqual([second!.id]);
    expect(battle.snapshot().bossTelegraphs.map(warning => warning.ownerId)).toEqual([second!.id]);
    expect(battle.snapshot().effects.some(effect => effect.kind === 'boss-blast')).toBe(false);
    battle.step(.36 / speed);
    expect(battle.snapshot().bossTelegraphs).toHaveLength(0);
    expect(battle.snapshot().hero.hp).toBe(320 - BOSS.damage);
    expect(battle.snapshot().effects.filter(effect => effect.kind === 'boss-blast')).toHaveLength(1);
  });

  it('copies both warnings and clears disposal state without affecting a different run', () => {
    const previous = dualBossBattle(10), current = dualBossBattle(11);
    previous.step(6.3); current.step(6.3);
    const state = previous.snapshot(); expect(state.bossTelegraphs).toHaveLength(2);
    (state.bossTelegraphs[0] as BossTelegraphState).ownerId = state.bossTelegraphs[1]!.ownerId;
    (state.bossTelegraphs[1] as BossTelegraphState).remaining = 0;
    expect(new Set(previous.snapshot().bossTelegraphs.map(warning => warning.ownerId)).size).toBe(2);
    expect(previous.snapshot().bossTelegraphs[1]!.remaining).toBeGreaterThan(1);
    previous.dispose(); previous.step(30);
    expect(previous.snapshot().bossTelegraphs).toEqual([]);
    expect(current.snapshot().bossTelegraphs).toHaveLength(2);
    current.setPaused(true); const frozen = current.snapshot(); current.step(30); expect(current.snapshot()).toEqual(frozen);
    const fresh = dualBossBattle(12);
    expect(fresh.snapshot()).toMatchObject({ runId: 12, defeatedBossCount: 0, bossTelegraphs: [], speed: 1 });
  });
});
