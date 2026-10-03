import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { skillPreview } from '../src/game/presentation/battlePresentation';
import { characterArt } from '../src/game/presentation/assets';

describe('battle presentation eligibility', () => {
  it('includes alive units at the actual area boundary and only the matching team', () => {
    const session = new BattleSession({ runId: 1, stage: { id: 'test', label: 'test', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400, spawns: [{ at: 0, kind: 'robot-melee' }] } });
    session.step(.01); session.dispatch({ type: 'summon', kind: 'melee' });
    const snapshot = session.snapshot();
    const enemy = snapshot.units.find(unit => unit.team === 'ai')!;
    const ally = snapshot.units.find(unit => unit.team === 'human')!;
    const value = { ...snapshot, hero: { ...snapshot.hero, x: 250 }, units: [
      { ...enemy, x: 370 }, { ...enemy, id: 20, x: 370.01 }, { ...enemy, id: 21, x: 300, hp: 0 },
      { ...ally, x: 360 }, { ...ally, id: 22, x: 360.01 },
    ] };
    expect(skillPreview(value, 'sleep')?.targetIds).toEqual([enemy.id]);
    expect(skillPreview(value, 'heal')?.targetIds).toEqual([ally.id, snapshot.hero.id]);
    expect(skillPreview(value, 'git-push')?.destinations).toEqual([{ id: enemy.id, from: 370, x: 466, bodyWidth: 32 }]);
    const atBase = { ...value, hero: { ...value.hero, x: 500 }, units: [{ ...enemy, x: 560 }] };
    expect(skillPreview(atBase, 'git-push')?.destinations[0]?.x).toBe(snapshot.aiBase.x - enemy.bodyWidth / 2);
    expect(skillPreview({ ...value, status: 'paused' }, 'heal')).toBeNull();
    expect(skillPreview({ ...value, status: 'won' }, 'sleep')).toBeNull();
    expect(characterArt('robot-runner')).toBe('robot-melee');
  });

  it('predicts only the first living enemy to the right with the actual endpoint allowance and ID tie break', () => {
    const session = new BattleSession({ runId: 1, stage: { id: 'test', label: 'test', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400, spawns: [{ at: 0, kind: 'robot-melee' }] } });
    const snapshot = session.snapshot(); const enemy = snapshot.units[0]!;
    const value = { ...snapshot, hero: { ...snapshot.hero, x: 200 }, units: [
      { ...enemy, id: 20, x: 200, hp: 0 }, { ...enemy, id: 21, x: 199.99 },
      { ...enemy, id: 22, team: 'human' as const, x: 205 },
      { ...enemy, id: 24, x: 220 }, { ...enemy, id: 23, x: 220 },
    ] };
    expect(skillPreview(value, 'hello-world')).toMatchObject({ shape: 'line', x: 200, endX: 555, targetIds: [23], targetLabel: '생산성 로봇' });
    expect(skillPreview({ ...value, units: [{ ...enemy, x: 555 }] }, 'hello-world')?.targetIds).toEqual([enemy.id]);
    expect(skillPreview({ ...value, units: [{ ...enemy, x: 555.01 }] }, 'hello-world')?.targetIds).toEqual([]);
    expect(skillPreview({ ...value, units: [{ ...enemy, x: 200 }] }, 'hello-world')?.targetIds).toEqual([enemy.id]);
    for (const status of ['paused', 'won', 'lost'] as const) expect(skillPreview({ ...value, status }, 'hello-world')).toBeNull();
  });

  it('includes the enemy base by the same distance and ID rules, and agrees with an actual empty-lane cast', () => {
    const session = new BattleSession({ runId: 1, stage: { id: 'test', label: 'test', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400, spawns: [{ at: 0, kind: 'robot-melee' }] } });
    const snapshot = session.snapshot(); const enemy = snapshot.units[0]!;
    const value = { ...snapshot, hero: { ...snapshot.hero, x: 235 }, units: [{ ...enemy, x: snapshot.aiBase.x }] };
    expect(skillPreview(value, 'hello-world')).toMatchObject({ targetIds: [snapshot.aiBase.id], targetLabel: '적 기지' });
    expect(skillPreview({ ...value, units: [{ ...enemy, x: 580 }] }, 'hello-world')?.targetIds).toEqual([enemy.id]);
    expect(skillPreview({ ...value, units: [], aiBase: { ...snapshot.aiBase, hp: 0 } }, 'hello-world')).toMatchObject({ targetIds: [], targetLabel: '없음' });
    const quiet = new BattleSession({ runId: 2, stage: { ...session.stage, spawns: [] } });
    quiet.dispatch({ type: 'move', direction: 1 }); quiet.step(2); quiet.dispatch({ type: 'move', direction: 0 });
    expect(skillPreview(quiet.snapshot(), 'hello-world')?.targetIds).toEqual([quiet.snapshot().aiBase.id]);
    quiet.dispatch({ type: 'skill', skill: 'hello-world' }); quiet.step(2);
    expect(quiet.snapshot().aiBase.hp).toBe(825);
  });
});
