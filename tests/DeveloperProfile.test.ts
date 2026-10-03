import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { ProfileService, SAVE_KEY, type SaveStorage } from '../src/game/progression/ProfileService';
import { STAGES } from '../src/game/progression/stages';
import { ALLY_KINDS } from '../src/game/battle/balance';
import { createStoryViewModel } from '../src/ui/viewmodels/StoryViewModel';
const storage = (): SaveStorage => {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
};
const scene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;

describe('ephemeral developer profile', () => {
  it('projects infinite XP and all valid maps without granting clears, allies or skills, notifying exactly once per transition', () => {
    const store = storage(), profile = new ProfileService(store); const write = vi.spyOn(store, 'setItem');
    const normal = profile.snapshot(), listener = vi.fn(); const off = profile.subscribe(listener); listener.mockClear();
    expect(profile.setDeveloperMode(true).accepted).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled();
    expect(profile.snapshot()).toMatchObject({ developerMode: true, xp: Infinity, clearedStages: normal.clearedStages,
      unlockedAllies: normal.unlockedAllies, unlockedSkills: normal.unlockedSkills });
    expect(profile.snapshot().unlockedStages).toEqual(STAGES.map(stage => stage.id));
    for (const stage of STAGES) expect(profile.canStart(stage.id)).toBe(true);
    expect(profile.canStart('3-1')).toBe(false); expect(profile.canStart('__proto__')).toBe(false);
    expect(profile.setDeveloperMode(true).accepted).toBe(true); expect(listener).toHaveBeenCalledTimes(1);
    profile.toggleDeveloperMode(); expect(listener).toHaveBeenCalledTimes(2); expect(profile.snapshot()).toEqual(normal);
    expect(store.getItem(SAVE_KEY)).toBeNull();
    for (const invalid of [undefined, null, 1, 'true']) expect(profile.setDeveloperMode(invalid as unknown as boolean).accepted).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2); profile.dispose();
    expect(profile.toggleDeveloperMode().accepted).toBe(false); expect(profile.setDeveloperMode(true).accepted).toBe(false);
    off();
  });

  it('deeply isolates upgrades, equipment, stories, mute and out-of-order rewards, restoring the normal save byte-for-byte on OFF/reload', () => {
    const store = storage(), profile = new ProfileService(store);
    profile.rewardWin('normal-first', '1-1'); profile.upgrade('hero'); profile.markStorySeen('prologue'); profile.setMuted(true);
    const normal = profile.snapshot(), saved = store.getItem(SAVE_KEY); const write = vi.spyOn(store, 'setItem'); write.mockClear();
    profile.setDeveloperMode(true);
    for (let level = normal.levels.hero; level < 10; level++) expect(profile.upgrade('hero').accepted).toBe(true);
    expect(profile.upgrade('hero').accepted).toBe(false);
    expect(profile.purchaseSkill('foreach').accepted).toBe(true); expect(profile.purchaseSkill('foreach').accepted).toBe(false);
    expect(profile.setEquippedSkills(['foreach']).accepted).toBe(true);
    expect(profile.setFormation(['technician', 'melee', ...Array<null>(8).fill(null)]).accepted).toBe(true);
    profile.setMuted(false); expect(profile.rewardWin('dev-final', '2-5', { developerRun: true })).toBe(650);
    expect(profile.snapshot().clearedStages).toEqual(['1-1', '2-5']); expect(profile.markStorySeen('chapter-2').accepted).toBe(true);
    expect(profile.markStorySeen('chapter-1').accepted).toBe(false);
    expect(profile.snapshot().seenStoryIds).toEqual(['prologue', 'chapter-2']);
    expect(write).not.toHaveBeenCalled(); expect(store.getItem(SAVE_KEY)).toBe(saved);
    expect(JSON.parse(saved!).xp).toBe(60); expect(saved).not.toContain('developerMode'); expect(saved).not.toContain('Infinity');
    // Reload while the first service is still in development sees the untouched finite normal data.
    const reload = new ProfileService(store); expect(reload.snapshot()).toEqual(normal); reload.dispose();
    profile.setDeveloperMode(false); expect(profile.snapshot()).toEqual(normal); expect(store.getItem(SAVE_KEY)).toBe(saved);
    profile.setDeveloperMode(true); expect(profile.snapshot().levels).toEqual(normal.levels);
    expect(profile.snapshot().equippedSkills).toEqual(normal.equippedSkills); expect(profile.snapshot().clearedStages).toEqual(normal.clearedStages);
    profile.setDeveloperMode(false); expect(profile.rewardWin('normal-replay', '1-1')).toBe(120);
    expect(profile.snapshot().xp).toBe(180); expect(JSON.parse(store.getItem(SAVE_KEY)!).xp).toBe(180);
    profile.dispose();
  });

  it('keeps max-level, actual ally ownership, formation and three-skill limits with zero finite XP', () => {
    const store = storage(), profile = new ProfileService(store); const write = vi.spyOn(store, 'setItem'); profile.setDeveloperMode(true);
    expect(profile.upgrade('technician').accepted).toBe(false);
    expect(profile.snapshot().unlockedAllies).not.toEqual(ALLY_KINDS);
    for (const skill of ['sleep', 'heal', 'git-push', 'overclock', 'foreach'] as const) expect(profile.purchaseSkill(skill).accepted).toBe(true);
    expect(profile.setEquippedSkills(['sleep', 'heal', 'git-push', 'overclock']).accepted).toBe(false);
    expect(profile.setEquippedSkills(['heal', 'heal']).accepted).toBe(false);
    expect(profile.setEquippedSkills(['sleep', 'heal', 'foreach']).accepted).toBe(true);
    expect(profile.setFormation(['firefighter', ...Array<null>(9).fill(null)]).accepted).toBe(false);
    expect(profile.setFormation(Array<null>(10).fill(null)).accepted).toBe(false);
    expect(profile.setFormation(['melee', 'melee', ...Array<null>(8).fill(null)]).accepted).toBe(false);
    expect(profile.rewardWin('dev-unlock-tech', '1-1')).toBe(120); expect(profile.upgrade('technician').accepted).toBe(true);
    expect(profile.snapshot().xp).toBe(Infinity); expect(write).not.toHaveBeenCalled();
    profile.setDeveloperMode(false); expect(profile.snapshot().xp).toBe(0);
    expect(profile.snapshot().unlockedAllies).not.toContain('technician'); expect(profile.snapshot().unlockedSkills).toEqual(['hello-world']);
    expect(store.getItem(SAVE_KEY)).toBeNull(); profile.dispose();
  });
});

describe('scope-owned developer battle receipts', () => {
  it('taints a normal-origin run permanently on ON, rejects its OFF win without a write and retains normal replay accounting', () => {
    const store = storage(), context = new AppContext(store); const scope = context.lifetimes.begin(scene());
    const tainted = context.trackDeveloperRun(scope); const normal = context.profile.snapshot(); const write = vi.spyOn(store, 'setItem');
    expect(tainted()).toBe(false); context.profile.setDeveloperMode(true); context.profile.setDeveloperMode(false);
    expect(tainted()).toBe(true); const receipt = context.newBattleReceipt();
    expect(context.profile.rewardWin(receipt, '1-1', { developerRun: tainted() })).toBe(0);
    expect(context.profile.snapshot()).toEqual(normal); expect(write).not.toHaveBeenCalled();
    // Even dropping the flag from a duplicate callback cannot turn the same rejected receipt into normal earnings.
    expect(context.profile.rewardWin(receipt, '1-1')).toBe(0);
    const clean = context.lifetimes.begin(scene()), cleanFlag = context.trackDeveloperRun(clean);
    expect(cleanFlag()).toBe(false);
    expect(context.profile.rewardWin(context.newBattleReceipt(), '1-1', { developerRun: cleanFlag() })).toBe(120);
    expect(context.profile.rewardWin(context.newBattleReceipt(), '1-1', { developerRun: cleanFlag() })).toBe(120);
    expect(context.profile.snapshot().xp).toBe(240); expect(write).toHaveBeenCalledTimes(2); context.dispose();
  });

  it('owns one profile listener per run and detaches it exactly once, including a scope already disposed', () => {
    const context = new AppContext(storage()); const subscribe = context.profile.subscribe.bind(context.profile);
    const cleanup = vi.fn();
    const spy = vi.spyOn(context.profile, 'subscribe').mockImplementation(listener => {
      const off = subscribe(listener); return () => { cleanup(); off(); };
    });
    const previous = context.lifetimes.begin(scene()); const flag = context.trackDeveloperRun(previous);
    expect(spy).toHaveBeenCalledTimes(1); previous.dispose(); previous.dispose(); expect(cleanup).toHaveBeenCalledTimes(1);
    context.profile.setDeveloperMode(true); expect(flag()).toBe(false);
    const next = context.lifetimes.begin(scene()); const nextFlag = context.trackDeveloperRun(next); expect(nextFlag()).toBe(true);
    context.profile.setDeveloperMode(false); expect(nextFlag()).toBe(true);
    next.dispose(); expect(cleanup).toHaveBeenCalledTimes(2);
    context.trackDeveloperRun(previous); expect(cleanup).toHaveBeenCalledTimes(3);
    context.dispose();
  });

  it('rewards ON runs only in shadow, stops observing disposed owners and captures hero stats once per battle', () => {
    const context = new AppContext(storage()), previous = context.lifetimes.begin(scene()); const previousFlag = context.trackDeveloperRun(previous);
    const session = new BattleSession({ runId: previous.id, levels: context.profile.snapshot().levels }); const before = session.snapshot();
    previous.dispose(); context.profile.setDeveloperMode(true); expect(previousFlag()).toBe(false);
    const current = context.lifetimes.begin(scene()), currentFlag = context.trackDeveloperRun(current); expect(currentFlag()).toBe(true);
    for (let level = 1; level < 10; level++) context.profile.upgrade('hero');
    expect(session.snapshot()).toEqual(before);
    const nextBattle = new BattleSession({ runId: current.id, levels: context.profile.snapshot().levels }); expect(nextBattle.snapshot().hero.level).toBe(10);
    const receipt = context.newBattleReceipt(); expect(context.profile.rewardWin(receipt, '2-5', { developerRun: currentFlag() })).toBe(650);
    expect(context.profile.rewardWin(receipt, '2-5', { developerRun: currentFlag() })).toBe(0);
    expect(context.profile.rewardWin('bad-stage', '3-1', { developerRun: true })).toBe(0);
    expect(context.profile.snapshot().clearedStages).toEqual(['2-5']); context.profile.setDeveloperMode(false);
    expect(context.profile.snapshot().clearedStages).toEqual([]); expect(context.profile.snapshot().levels.hero).toBe(1);
    current.dispose(); context.dispose(); expect(context.bridge.listenerCount).toBe(0);
  });
});

describe('story eligibility after leaving developer mode', () => {
  it('cancels a developer-only final story immediately, never marks it in normal data and cannot revive it with a stale win', () => {
    const context = new AppContext(storage()); context.profile.markStorySeen('prologue');
    const scope = context.lifetimes.begin(scene()), story = createStoryViewModel(context);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, stageId: '2-5', phase: 'ready' });
    const normal = context.profile.snapshot(); context.profile.setDeveloperMode(true);
    context.profile.rewardWin('dev-final', '2-5', { developerRun: true });
    const won = { ...new BattleSession({ runId: scope.id, stage: STAGES.at(-1)! }).snapshot(), status: 'won' as const };
    context.bridge.emit('battle-snapshot', won); expect(story.currentStory.value?.id).toBe('chapter-2'); story.next();
    context.profile.setDeveloperMode(false); expect(story.currentStory.value).toBeNull(); expect(story.hasOverlay.value).toBe(false);
    story.next(); story.skip(); context.bridge.emit('battle-snapshot', won);
    expect(story.currentStory.value).toBeNull(); expect(context.profile.snapshot()).toEqual(normal);
    story.dispose(); context.dispose();
  });

  it('preserves a normally earned story while toggling the isolated profile', () => {
    const context = new AppContext(storage()); context.profile.markStorySeen('prologue');
    for (const stage of STAGES.slice(0, 5)) context.profile.rewardWin(stage.id, stage.id);
    const scope = context.lifetimes.begin(scene()), story = createStoryViewModel(context);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    expect(story.currentStory.value?.id).toBe('chapter-1'); story.next(); const page = story.pageIndex.value;
    context.profile.setDeveloperMode(true); context.profile.setDeveloperMode(false);
    expect(story.currentStory.value?.id).toBe('chapter-1'); expect(story.pageIndex.value).toBe(page);
    story.dispose(); context.dispose();
  });
});
