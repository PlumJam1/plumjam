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
    expect(skillPreview(value, 'hello-world')).toBeNull();
    expect(characterArt('robot-runner')).toBe('robot-melee');
  });
});
