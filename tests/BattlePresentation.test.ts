import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { getBaseArt, getBossHud, getEnemyBaseKey, skillPreview } from '../src/game/presentation/battlePresentation';
import { characterArt } from '../src/game/presentation/assets';
import { STAGES } from '../src/game/progression/stages';

describe('battle presentation eligibility', () => {
  it('uses provided base art for every catalog stage, choosing boss bases by encounter rather than dark backgrounds', () => {
    const snapshot = new BattleSession({ runId: 1 }).snapshot();
    expect(STAGES).toHaveLength(10);
    for (const stage of STAGES) {
      const expected = stage.id === '2-5' ? 'enemy-base-chapter-2-boss' : stage.spawns.some(spawn => spawn.kind === 'gpt-4o') ? 'enemy-base-3' : stage.id.startsWith('2-') ? 'enemy-base-chapter-2' : 'enemy-base';
      expect(getEnemyBaseKey(stage.id)).toBe(expected);
      expect(getBaseArt({ ...snapshot, stageId: stage.id }).enemy).toBe(expected);
      expect(getBaseArt({ ...snapshot, stageId: stage.id, aiBase: { ...snapshot.aiBase, hp: 0 } }).enemy).toBe(`${expected}-destroyed`);
    }
    expect(getEnemyBaseKey('2-3')).toBe('enemy-base-chapter-2');
    expect(getEnemyBaseKey('2-4')).toBe('enemy-base-chapter-2');
    expect(getEnemyBaseKey('2-5')).toBe('enemy-base-chapter-2-boss');
    expect(getEnemyBaseKey('benchmark')).toBeNull();
    expect(getEnemyBaseKey()).toBeNull();
  });

  it('shows all living boss HP and the closest actual warning owner, then updates after one boss dies', () => {
    const battle = new BattleSession({ runId: 1, stage: { id: 'bosses', label: 'bosses', initialGold: 400, humanBaseHp: 900, aiBaseHp: 900,
      spawns: [{ at: 0, kind: 'gpt-4o' }, { at: 0, kind: 'gpt-4o' }] } });
    const snapshot = battle.snapshot(); const first = snapshot.units[0]!, second = snapshot.units[1]!;
    const value = { ...snapshot, hero: { ...snapshot.hero, x: 350 }, units: [{ ...first, hp: 600 }, { ...second, hp: 1200 }],
      bossTelegraphs: [{ ownerId: first.id, x: 100, radius: 80, remaining: .4, duration: 1.4 }, { ownerId: second.id, x: 360, radius: 80, remaining: 1.2, duration: 1.4 }] };
    expect(getBossHud(value)).toMatchObject({ count: 2, label: 'GPT-4o ×2', hp: 1800, maxHp: 3000, percent: 60, progress: .6,
      castCount: 2, attackOwnerId: second.id, attack: '범위 공격 2개 · 가까운 공격 1.2초' });
    const one = { ...value, units: [{ ...first, hp: 0 }, { ...second, hp: 1200 }] };
    expect(getBossHud(one)).toMatchObject({ count: 1, label: 'GPT-4o', hp: 1200, maxHp: 1500, percent: 80,
      castCount: 1, attackOwnerId: second.id, attack: '전방 범위 공격 1.2초' });
    expect(getBossHud({ ...one, bossTelegraphs: [], units: [{ ...second, bossCooldown: 4.2 }] })?.attack).toBe('범위 공격 준비 4.2초');
    expect(getBossHud({ ...value, units: [] })).toBeNull();
  });

  it('preserves standing bases on hero defeat and selects each destroyed texture by its own HP', () => {
    const snapshot = new BattleSession({ runId: 1 }).snapshot();
    const heroDefeat = { ...snapshot, status: 'lost' as const, hero: { ...snapshot.hero, hp: 0 } };
    expect(getBaseArt(heroDefeat)).toEqual({ human: 'human-base', enemy: 'enemy-base' });
    expect(getBaseArt({ ...snapshot, humanBase: { ...snapshot.humanBase, hp: 0 } })).toEqual({ human: 'human-base-destroyed', enemy: 'enemy-base' });
    expect(getBaseArt({ ...snapshot, stageId: '1-5', humanBase: { ...snapshot.humanBase, hp: 0 }, aiBase: { ...snapshot.aiBase, hp: 0 } })).toEqual({ human: 'human-base-destroyed', enemy: 'enemy-base-3-destroyed' });
  });

  it('previews foreach at a fixed forward center, including bosses and excluding the enemy base', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['foreach'], equippedSkills: ['foreach'], stage: { id: 'test', label: 'test', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400, spawns: [{ at: 0, kind: 'gpt-4o' }] } });
    const snapshot = session.snapshot(); const enemy = snapshot.units[0]!;
    const value = { ...snapshot, hero: { ...snapshot.hero, x: 370 }, units: [{ ...enemy, x: 640 }, { ...enemy, id: 20, x: 640.01 }, { ...enemy, id: 21, x: 550, hp: 0 }, { ...enemy, id: 22, team: 'human' as const, x: 550 }] };
    expect(skillPreview(value, 'foreach')).toMatchObject({ shape: 'area', x: 550, radius: 90, targetIds: [enemy.id] });
  });
  it('includes alive units at the actual area boundary and only the matching team', () => {
    const session = new BattleSession({ runId: 1, unlockedSkills: ['sleep', 'heal', 'git-push'], equippedSkills: ['sleep', 'heal', 'git-push'], stage: { id: 'test', label: 'test', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400, spawns: [{ at: 0, kind: 'robot-melee' }] } });
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
    expect(skillPreview({ ...value, equippedSkills: [] }, 'heal')).toBeNull();
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
