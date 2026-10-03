import { describe, expect, it, vi } from 'vitest';
import { ProfileService, SAVE_KEY, type SaveStorage } from '../src/game/progression/ProfileService';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { getStage, nextStage, STAGES } from '../src/game/progression/stages';

const memoryStorage = (initial?: string): SaveStorage => {
  const values = new Map<string, string>(initial === undefined ? [] : [[SAVE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
};
describe('permanent progression', () => {
  it('rewards each new victory, rejects duplicates, unlocks sequentially and rejects unknown/locked stages', () => {
    const context = new AppContext(memoryStorage());
    const profile = context.profile;
    expect(context.stageForBattle('1-2')).toBeUndefined();
    expect(context.stageForBattle('1-6')).toBeUndefined();
    expect(profile.rewardWin('locked', '1-2')).toBe(0);
    const first = context.newBattleReceipt();
    expect(profile.rewardWin(first, '1-1')).toBe(120);
    expect(profile.rewardWin(first, '1-1')).toBe(0);
    expect(profile.rewardWin(context.newBattleReceipt(), '1-1')).toBe(120);
    expect(profile.snapshot().xp).toBe(240);
    expect(profile.snapshot().unlockedStages).toEqual(['1-1', '1-2']);
    expect(context.stageForBattle('1-2')?.id).toBe('1-2');
    context.dispose();
  });
  it('spends currency only on the chosen character, rejects shortage and caps at ten', () => {
    const profile = new ProfileService(memoryStorage());
    expect(profile.upgrade('hero').accepted).toBe(false);
    expect(profile.snapshot().levels.hero).toBe(1);
    for (let run = 0; run < 20; run++) profile.rewardWin(String(run), '1-1');
    const before = profile.snapshot().xp;
    expect(profile.upgrade('ranged').accepted).toBe(true);
    expect(profile.snapshot().xp).toBe(before - 60);
    expect(profile.snapshot().levels).toEqual({ hero: 1, melee: 1, ranged: 2, support: 1 });
    for (let level = 2; level < 10; level++) expect(profile.upgrade('ranged').accepted).toBe(true);
    const capped = profile.snapshot();
    expect(profile.upgrade('ranged').accepted).toBe(false);
    expect(profile.snapshot()).toEqual(capped);
    expect(profile.upgrade('unknown' as 'hero').accepted).toBe(false);
  });
  it('saves/reloads levels, currency, progress and settings without persisting run receipts', () => {
    const storage = memoryStorage();
    const app = new AppContext(storage);
    app.profile.rewardWin(app.newBattleReceipt(), '1-1');
    app.profile.upgrade('hero'); app.profile.setMuted(true);
    const saved = app.profile.snapshot();
    expect(storage.getItem(SAVE_KEY)).not.toContain('battle-');
    app.dispose();
    const reload = new AppContext(storage);
    expect(reload.profile.snapshot()).toEqual(saved);
    expect(reload.profile.rewardWin(reload.newBattleReceipt(), '1-1')).toBe(120);
    expect(reload.profile.snapshot().xp).toBe(saved.xp + 120);
    reload.dispose();
  });
  it('falls back safely on malformed, impossible or blocked storage and keeps playable changes', () => {
    for (const raw of ['{', '{"version":2}', JSON.stringify({ version: 1, xp: 100, levels: { hero: 1, melee: 1, ranged: 1, support: 1 }, clearedStages: [], unlockedStages: ['1-1', '1-5'], muted: false })]) {
      const model = new ProfileService(memoryStorage(raw));
      expect(model.snapshot().levels.hero).toBe(1);
      expect(model.snapshot().unlockedStages).toEqual(['1-1']);
      expect(model.snapshot().storageMessage).not.toBe('');
      model.rewardWin('new', '1-1');
      expect(new ProfileService(memoryStorage(JSON.stringify(model.snapshot()))).snapshot().xp).toBe(120);
    }
    const blocked = new ProfileService({ getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('quota'); } });
    expect(blocked.rewardWin('victory', '1-1')).toBe(120);
    expect(blocked.upgrade('hero').accepted).toBe(true);
    expect(blocked.snapshot().levels.hero).toBe(2);
    expect(blocked.snapshot().storageMessage).not.toBe('');
    expect(new ProfileService().snapshot().storageMessage).not.toBe('');
  });
  it('returns immutable detached snapshots and removes subscriptions at cleanup', () => {
    const profile = new ProfileService(memoryStorage());
    const first = profile.snapshot();
    const listener = vi.fn();
    const off = profile.subscribe(listener);
    profile.rewardWin('first', '1-1');
    expect(first.xp).toBe(0);
    expect(first.unlockedStages).toEqual(['1-1']);
    expect(Object.isFrozen(first.levels)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    off(); off(); profile.rewardWin('second', '1-1');
    expect(listener).toHaveBeenCalledTimes(2);
    profile.subscribe(listener); profile.dispose(); profile.rewardWin('third', '1-1');
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it('preserves leveled stats and the level-five visual threshold in a new battle', () => {
    const profile = new ProfileService(memoryStorage());
    for (let run = 0; run < 4; run++) profile.rewardWin(String(run), '1-1');
    for (let level = 1; level < 4; level++) profile.upgrade('hero');
    const before = new BattleSession({ runId: 1, levels: profile.snapshot().levels });
    expect(before.snapshot().hero.level).toBe(4);
    profile.upgrade('hero');
    const after = new BattleSession({ runId: 2, levels: profile.snapshot().levels });
    expect(after.snapshot().hero.level).toBe(5);
    expect(after.snapshot().hero.maxHp).toBeGreaterThan(before.snapshot().hero.maxHp);
    expect(before.snapshot().hero.level).toBe(4);
  });
});
describe('five-stage campaign', () => {
  it('has increasing wave pressure and rewards, and only stage five starts with GPT-4o', () => {
    expect(STAGES.map(stage => stage.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5']);
    for (let index = 1; index < STAGES.length; index++) {
      expect(STAGES[index].spawns.length).toBeGreaterThan(STAGES[index - 1].spawns.length);
      expect(STAGES[index].repeat!.interval).toBeLessThan(STAGES[index - 1].repeat!.interval);
      expect(STAGES[index].aiBaseHp).toBeGreaterThan(STAGES[index - 1].aiBaseHp);
      expect(STAGES[index].clearReward).toBeGreaterThan(STAGES[index - 1].clearReward!);
    }
    const boss = new BattleSession({ runId: 1, stage: getStage('1-5') });
    expect(boss.snapshot().elapsed).toBe(0);
    expect(boss.snapshot().units.map(unit => unit.kind)).toEqual(['gpt-4o']);
    expect(nextStage('1-5')).toBeUndefined(); expect(nextStage('missing')).toBeUndefined();
  });
});
