import { describe, expect, it, vi } from 'vitest';
import { ProfileService, SAVE_KEY, type SaveStorage } from '../src/game/progression/ProfileService';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { getStage, nextStage, STAGES } from '../src/game/progression/stages';
import { DEFAULT_UNLOCKED_SKILLS } from '../src/game/battle/balance';
import type { SkillKind } from '../src/game/battle/types';

const memoryStorage = (initial?: string): SaveStorage => {
  const values = new Map<string, string>(initial === undefined ? [] : [[SAVE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
};
describe('permanent progression', () => {
  it('migrates legacy v1 saves while retaining currency, character levels, campaign progress and audio settings', () => {
    const saved = { version: 1, xp: 510, levels: { hero: 5, melee: 3, ranged: 4, support: 2 }, clearedStages: ['1-1', '1-2'], unlockedStages: ['1-1', '1-2', '1-3'], muted: true };
    const profile = new ProfileService(memoryStorage(JSON.stringify(saved)));
    expect(profile.snapshot()).toMatchObject({ ...saved, unlockedSkills: ['hello-world', 'sleep', 'heal', 'overclock'], equippedSkills: ['hello-world', 'sleep', 'heal'], storageMessage: '' });
    expect(profile.snapshot().unlockedSkills).toContain('overclock');
    expect(profile.snapshot().unlockedSkills).not.toContain('git-push');
  });
  it('buys git push once with the same XP used for upgrades and persists its unlock', () => {
    const storage = memoryStorage(); const write = vi.spyOn(storage, 'setItem');
    const profile = new ProfileService(storage);
    const original = profile.snapshot();
    profile.rewardWin('first', '1-1'); profile.rewardWin('second', '1-1');
    const before = profile.snapshot(); write.mockClear();
    expect(profile.purchaseSkill('git-push').accepted).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(profile.snapshot().xp).toBe(0);
    expect(profile.snapshot().levels).toEqual(before.levels);
    expect(profile.snapshot().unlockedSkills).toEqual([...DEFAULT_UNLOCKED_SKILLS, 'git-push']);
    expect(original.unlockedSkills).toEqual(DEFAULT_UNLOCKED_SKILLS);
    expect(Object.isFrozen(profile.snapshot().unlockedSkills)).toBe(true);
    expect(new ProfileService(storage).snapshot()).toEqual(profile.snapshot());
    expect(profile.purchaseSkill('git-push').accepted).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('rejects insufficient, duplicate, free and invalid skill purchases without spending or saving', () => {
    const storage = memoryStorage(); const write = vi.spyOn(storage, 'setItem');
    const profile = new ProfileService(storage);
    profile.rewardWin('first', '1-1');
    const poor = profile.snapshot(); write.mockClear();
    for (const kind of ['git-push', 'overclock', 'hello-world', 'invalid', 'toString'] as SkillKind[]) expect(profile.purchaseSkill(kind).accepted).toBe(false);
    expect(profile.snapshot()).toEqual(poor); expect(write).not.toHaveBeenCalled();
    profile.rewardWin('second', '1-1'); profile.purchaseSkill('git-push'); profile.rewardWin('third', '1-1');
    const owned = profile.snapshot(); write.mockClear();
    expect(profile.purchaseSkill('git-push').accepted).toBe(false);
    expect(profile.snapshot()).toEqual(owned); expect(write).not.toHaveBeenCalled();
  });
  it('preserves explicit skill ownership and validates unknown skill ids', () => {
    const saved = { version: 1, xp: 240, levels: { hero: 1, melee: 1, ranged: 1, support: 1 }, clearedStages: [], unlockedStages: ['1-1'], muted: false, unlockedSkills: ['git-push', 'git-push'] };
    expect(new ProfileService(memoryStorage(JSON.stringify(saved))).snapshot().unlockedSkills).toEqual(['hello-world', 'git-push']);
    const invalid = new ProfileService(memoryStorage(JSON.stringify({ ...saved, unlockedSkills: ['invalid'] })));
    expect(invalid.snapshot().storageMessage).not.toBe('');
    expect(invalid.snapshot().unlockedSkills).toEqual(DEFAULT_UNLOCKED_SKILLS);
  });
  it('keeps purchased skills playable in memory when storage writes are blocked and releases listeners', () => {
    const profile = new ProfileService({ getItem: () => null, setItem: () => { throw Error('quota'); } });
    profile.rewardWin('first', '1-1'); profile.rewardWin('second', '1-1');
    const listener = vi.fn(); profile.subscribe(listener);
    expect(profile.purchaseSkill('git-push').accepted).toBe(true);
    expect(profile.snapshot().unlockedSkills).toContain('git-push');
    expect(profile.snapshot().storageMessage).not.toBe('');
    expect(listener).toHaveBeenCalledTimes(2);
    profile.dispose(); profile.rewardWin('third', '1-1');
    expect(listener).toHaveBeenCalledTimes(2);
  });
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
    expect(profile.snapshot().levels).toMatchObject({ hero: 1, melee: 1, ranged: 2, support: 1 });
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
  it('adds distinct tactical pressure with increasing base health and rewards, and only stage five starts with GPT-4o', () => {
    expect(STAGES.map(stage => stage.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5']);
    for (let index = 1; index < STAGES.length; index++) {
      expect(STAGES[index].spawns.length).toBeGreaterThanOrEqual(STAGES[index - 1].spawns.length);
      expect(STAGES[index].repeat!.interval).toBeLessThanOrEqual(STAGES[index - 1].repeat!.interval);
      expect(STAGES[index].aiBaseHp).toBeGreaterThan(STAGES[index - 1].aiBaseHp);
      expect(STAGES[index].clearReward).toBeGreaterThan(STAGES[index - 1].clearReward!);
    }
    expect(getStage('1-2')!.spawns.filter(spawn => spawn.kind === 'robot-runner')).toHaveLength(3);
    expect(getStage('1-3')!.spawns.filter(spawn => spawn.kind === 'robot-ranged').length).toBeGreaterThan(getStage('1-3')!.spawns.filter(spawn => spawn.kind === 'robot-melee').length);
    expect(getStage('1-4')!.spawns.some(spawn => spawn.kind === 'robot-heavy')).toBe(true);
    const boss = new BattleSession({ runId: 1, stage: getStage('1-5') });
    expect(boss.snapshot().elapsed).toBe(0);
    expect(boss.snapshot().units.map(unit => unit.kind)).toEqual(['gpt-4o']);
    expect(nextStage('1-5')).toBeUndefined(); expect(nextStage('missing')).toBeUndefined();
  });
});


describe('ten-slot roster progression', () => {
  const legacy = { version: 1, xp: 710, levels: { hero: 5, melee: 3, ranged: 2, support: 4 }, clearedStages: ['1-1', '1-2', '1-3'], unlockedStages: ['1-1', '1-2', '1-3', '1-4'], unlockedSkills: ['git-push'], muted: true };
  it('backfills new levels and retroactive unlocks without changing existing progress or auto-equipping', () => {
    const model = new ProfileService(memoryStorage(JSON.stringify(legacy)));
    expect(model.snapshot()).toMatchObject({ xp: 710, levels: { ...legacy.levels, technician: 1, judge: 1, counselor: 1 }, clearedStages: legacy.clearedStages, muted: true, storageMessage: '' });
    expect(model.snapshot().unlockedSkills).toContain('git-push');
    expect(model.snapshot().unlockedAllies).toEqual(['melee', 'ranged', 'support', 'technician', 'judge', 'counselor', 'firefighter']);
    expect(model.snapshot().equippedAllies).toEqual(['melee', 'ranged', 'support', null, null, null, null, null, null, null]);
  });
  it('repairs malformed, duplicate, locked and empty formations while preserving earned progress', () => {
    for (const equippedAllies of [[], ['melee', 'ranged'], ['hero', null, null, null, null], ['melee', 'melee', null, null, null], [null, null, null, null, null], ['invalid', null, null, null, null], 'bad']) {
      const model = new ProfileService(memoryStorage(JSON.stringify({ ...legacy, equippedAllies })));
      expect(model.snapshot().xp).toBe(710);
      expect(model.snapshot().levels.hero).toBe(5);
      expect(model.snapshot().equippedAllies).toEqual(['melee', 'ranged', 'support', null, null, null, null, null, null, null]);
    }
    const noClear = { ...legacy, clearedStages: [], unlockedStages: ['1-1'], equippedAllies: ['technician', null, null, null, null], unlockedAllies: ['technician'] };
    expect(new ProfileService(memoryStorage(JSON.stringify(noClear))).snapshot()).toMatchObject({ xp: 710, unlockedAllies: ['melee', 'ranged', 'support'], equippedAllies: ['melee', 'ranged', 'support', null, null, null, null, null, null, null] });
  });
  it('rejects invalid slot updates and locked upgrades atomically without writing or spending', () => {
    const storage = memoryStorage(); const write = vi.spyOn(storage, 'setItem'); const model = new ProfileService(storage);
    const before = model.snapshot();
    expect(model.setSlot(-1, 'melee').accepted).toBe(false);
    expect(model.setSlot(10, 'melee').accepted).toBe(false);
    expect(model.setSlot(.5, 'melee').accepted).toBe(false);
    expect(model.setSlot(3, 'melee').accepted).toBe(false);
    expect(model.setSlot(3, 'technician').accepted).toBe(false);
    expect(model.setFormation([null, null, null, null, null]).accepted).toBe(false);
    expect(model.upgrade('counselor').accepted).toBe(false);
    expect(model.snapshot()).toEqual(before); expect(write).not.toHaveBeenCalled();
  });
  it('unlocks once on first victory, retains replay XP, and saves detached unique slots', () => {
    const storage = memoryStorage(); const model = new ProfileService(storage);
    const initial = model.snapshot();
    expect(model.rewardWin('first', '1-1')).toBe(120);
    expect(model.snapshot().unlockedAllies).toEqual(['melee', 'ranged', 'support', 'technician']);
    expect(model.rewardWin('first', '1-1')).toBe(0);
    expect(model.rewardWin('replay', '1-1')).toBe(120);
    expect(model.snapshot().unlockedAllies).toEqual(['melee', 'ranged', 'support', 'technician']);
    const slots: Array<'melee' | 'technician' | null> = ['technician', null, 'melee', null, null, null, null, null, null, null];
    expect(model.setFormation(slots).accepted).toBe(true); slots[0] = null;
    expect(model.snapshot().equippedAllies[0]).toBe('technician');
    expect(Object.isFrozen(model.snapshot().equippedAllies)).toBe(true);
    expect(Object.isFrozen(model.snapshot().unlockedAllies)).toBe(true);
    expect(initial.equippedAllies).toEqual(['melee', 'ranged', 'support', null, null, null, null, null, null, null]);
    expect(new ProfileService(storage).snapshot()).toEqual(model.snapshot());
    expect(model.snapshot().xp).toBe(240);
  });
});


describe('permanent skill ownership and three-slot loadout', () => {
  it('starts with only Hello, purchases without auto-equipping and persists zero or three unique owned skills', () => {
    const storage = memoryStorage(); const model = new ProfileService(storage);
    expect(model.snapshot()).toMatchObject({ unlockedSkills: ['hello-world'], equippedSkills: ['hello-world'] });
    for (let run = 0; run < 8; run++) model.rewardWin(String(run), '1-1');
    const before = model.snapshot().xp;
    for (const kind of ['sleep', 'heal', 'git-push', 'overclock'] as SkillKind[]) expect(model.purchaseSkill(kind).accepted).toBe(true);
    expect(model.snapshot().xp).toBe(before - 120 - 160 - 240 - 200);
    expect(model.snapshot().equippedSkills).toEqual(['hello-world']);
    const loadout: SkillKind[] = ['sleep', 'git-push', 'overclock'];
    expect(model.setEquippedSkills(loadout).accepted).toBe(true); loadout[0] = 'heal';
    expect(model.snapshot().equippedSkills).toEqual(['sleep', 'git-push', 'overclock']);
    expect(Object.isFrozen(model.snapshot().equippedSkills)).toBe(true);
    expect(new ProfileService(storage).snapshot()).toEqual(model.snapshot());
    expect(model.setEquippedSkills([]).accepted).toBe(true);
    expect(new ProfileService(storage).snapshot().equippedSkills).toEqual([]);
  });
  it('rejects duplicate, fourth and unowned equipment atomically with no XP or writes', () => {
    const storage = memoryStorage(); const write = vi.spyOn(storage, 'setItem'); const model = new ProfileService(storage);
    const before = model.snapshot();
    for (const loadout of [['hello-world', 'hello-world'], ['sleep'], ['hello-world', 'sleep', 'heal', 'overclock'], ['invalid']] as SkillKind[][]) expect(model.setEquippedSkills(loadout).accepted).toBe(false);
    expect(model.snapshot()).toEqual(before); expect(write).not.toHaveBeenCalled();
  });
  it('repairs only malformed loadouts and backfills priority while preserving every earned field and purchase', () => {
    const saved = { version: 1, xp: 710, levels: { hero: 5, melee: 3, ranged: 2, support: 4 }, clearedStages: ['1-1', '1-2'], unlockedStages: ['1-1', '1-2', '1-3'], muted: true, unlockedSkills: ['overclock', 'git-push', 'heal', 'sleep', 'hello-world'], equippedAllies: ['technician', 'ranged', null, null, null] };
    const missing = new ProfileService(memoryStorage(JSON.stringify(saved))).snapshot();
    expect(missing).toMatchObject({ xp: 710, levels: saved.levels, muted: true, clearedStages: saved.clearedStages, equippedAllies: [...saved.equippedAllies, null, null, null, null, null], unlockedSkills: ['hello-world', 'overclock', 'git-push', 'heal', 'sleep'], equippedSkills: ['hello-world', 'sleep', 'heal'], storageMessage: '' });
    for (const equippedSkills of [['invalid', 'sleep', 'sleep', 'git-push', 'overclock', 'heal'], 'bad']) {
      const restored = new ProfileService(memoryStorage(JSON.stringify({ ...saved, equippedSkills }))).snapshot();
      expect(restored).toMatchObject({ xp: 710, levels: saved.levels, muted: true, clearedStages: saved.clearedStages, equippedAllies: [...saved.equippedAllies, null, null, null, null, null], storageMessage: '' });
      expect(restored.equippedSkills.length).toBeLessThanOrEqual(3);
      expect(restored.equippedSkills.every(kind => restored.unlockedSkills.includes(kind))).toBe(true);
      expect(new Set(restored.equippedSkills).size).toBe(restored.equippedSkills.length);
    }
    const locked = new ProfileService(memoryStorage(JSON.stringify({ ...saved, unlockedSkills: ['hello-world'], equippedSkills: ['heal', 'hello-world'] })));
    expect(locked.snapshot()).toMatchObject({ xp: 710, equippedSkills: ['hello-world'] });
  });
});


describe('five-to-ten slot save migration', () => {
  it('preserves all five original positions and every earned field while adding five empty slots', () => {
    const saved = { version: 1, xp: 710, levels: { hero: 5, melee: 3, ranged: 2, support: 4 }, clearedStages: ['1-1'], unlockedStages: ['1-1', '1-2'], muted: true, unlockedSkills: ['hello-world', 'git-push'], equippedSkills: ['git-push'], equippedAllies: [null, 'technician', null, 'melee', 'ranged'] };
    const storage = memoryStorage(JSON.stringify(saved)); const model = new ProfileService(storage);
    expect(model.snapshot()).toMatchObject({ xp: 710, levels: saved.levels, clearedStages: saved.clearedStages, muted: true, unlockedSkills: saved.unlockedSkills, equippedSkills: saved.equippedSkills, equippedAllies: [...saved.equippedAllies, null, null, null, null, null] });
    const next = [...model.snapshot().equippedAllies]; next[5] = 'support';
    expect(model.setFormation(next).accepted).toBe(true);
    expect(model.setSlot(9, 'technician').accepted).toBe(false);
    next[1] = null; next[9] = 'technician'; expect(model.setFormation(next).accepted).toBe(true);
    expect(new ProfileService(storage).snapshot()).toEqual(model.snapshot());
    expect(model.snapshot().equippedAllies[9]).toBe('technician');
    expect(model.snapshot().xp).toBe(710);
  });
});


describe('new roster and foreach ownership progression', () => {
  it('retroactively unlocks all new allies on saved clears while preserving formation and skill purchases', () => {
    const profile = new ProfileService(memoryStorage());
    for (const stage of STAGES) profile.rewardWin(stage.id, stage.id);
    const saved = profile.snapshot(); const legacyFive = saved.equippedAllies.slice(0, 5);
    const restored = new ProfileService(memoryStorage(JSON.stringify({ ...saved, equippedAllies: legacyFive }))).snapshot();
    expect(restored.unlockedAllies).toEqual(['melee', 'ranged', 'support', 'technician', 'judge', 'counselor', 'athlete', 'firefighter', 'singer']);
    expect(restored).toMatchObject({ xp: saved.xp, levels: saved.levels, muted: saved.muted, clearedStages: saved.clearedStages, equippedSkills: saved.equippedSkills, unlockedSkills: saved.unlockedSkills, equippedAllies: [...legacyFive, null, null, null, null, null] });
    expect(restored.unlockedSkills).not.toContain('foreach');
  });
  it('buys foreach once at 220 XP without auto-equipping or changing existing five owned skills', () => {
    const profile = new ProfileService(memoryStorage());
    for (let run = 0; run < 10; run++) profile.rewardWin(String(run), '1-1');
    for (const kind of ['sleep', 'heal', 'git-push', 'overclock'] as SkillKind[]) profile.purchaseSkill(kind);
    const before = profile.snapshot();
    expect(profile.purchaseSkill('foreach').accepted).toBe(true);
    const bought = profile.snapshot(); expect(bought.xp).toBe(before.xp - 220);
    expect(bought.unlockedSkills).toEqual([...before.unlockedSkills, 'foreach']);
    expect(bought.equippedSkills).toEqual(before.equippedSkills);
    expect(profile.purchaseSkill('foreach').accepted).toBe(false); expect(profile.snapshot()).toEqual(bought);
    expect(profile.setEquippedSkills(['foreach', 'hello-world', 'sleep']).accepted).toBe(true);
    expect(profile.snapshot().equippedSkills).toEqual(['foreach', 'hello-world', 'sleep']);
  });
});
