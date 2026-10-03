import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import type { SaveStorage } from '../src/game/progression/ProfileService';
import { STAGES } from '../src/game/progression/stages';
import { createStoryViewModel } from '../src/ui/viewmodels/StoryViewModel';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';
import { handleStoryKey, storyKeyAction } from '../src/ui/storyInput';
const storage = (): SaveStorage => { const values = new Map<string,string>(); return { getItem: key => values.get(key) ?? null, setItem: (key,value) => { values.set(key,value); } }; };
const scene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
const gameplay = (context: AppContext) => { const { seenStoryIds: _seen, ...rest } = context.profile.snapshot(); return rest; };

describe('app-owned story lifecycle and reading', () => {
  it('waits for ready Lobby, writes seen only at completion/skip and leaves gameplay unchanged', () => {
    const context = new AppContext(storage()), scope = context.lifetimes.begin(scene());
    const story = createStoryViewModel(context), original = gameplay(context);
    context.bridge.emit('scene-state', { scene: 'Boot', runId: scope.id, phase: 'loading' }); expect(story.currentStory.value).toBeNull();
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'loading' }); expect(story.currentStory.value).toBeNull();
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    expect(story.currentStory.value?.id).toBe('prologue'); expect(story.pageIndex.value).toBe(0);
    story.next(); expect(story.pageIndex.value).toBe(1); expect(context.profile.snapshot().seenStoryIds).toEqual([]);
    story.previous(); expect(story.pageIndex.value).toBe(0);
    for (let page = 0; page < story.total.value - 1; page++) story.next();
    expect(story.isLast.value).toBe(true); expect(context.profile.snapshot().seenStoryIds).toEqual([]);
    story.next(); expect(story.hasOverlay.value).toBe(false); expect(context.profile.snapshot().seenStoryIds).toEqual(['prologue']);
    expect(gameplay(context)).toEqual(original); story.dispose(); context.dispose();
  });
  it('catches up past cleared bosses in catalog order without resetting earned saves', () => {
    const save = storage(), prior = new AppContext(save);
    for (const stage of STAGES) prior.profile.rewardWin(stage.id, stage.id);
    prior.profile.upgrade('hero'); prior.profile.purchaseSkill('sleep'); prior.profile.setMuted(true);
    const original = gameplay(prior); prior.dispose();
    const context = new AppContext(save), scope = context.lifetimes.begin(scene()), story = createStoryViewModel(context);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    for (const id of ['prologue', 'chapter-1', 'chapter-2']) { expect(story.currentStory.value?.id).toBe(id); story.skip(); }
    expect(story.currentStory.value).toBeNull(); expect(context.profile.snapshot().seenStoryIds).toEqual(['prologue', 'chapter-1', 'chapter-2']);
    expect(gameplay(context)).toEqual(original); story.dispose(); context.dispose();
  });
  it('opens boss aftermath only after valid current-run victory and actual reward progress, never for losses or duplicate snapshots', () => {
    const context = new AppContext(storage()); context.profile.markStorySeen('prologue');
    for (const stage of STAGES.slice(0,4)) context.profile.rewardWin(stage.id,stage.id);
    const scope = context.lifetimes.begin(scene()), story = createStoryViewModel(context);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, stageId: '1-5', phase: 'ready' });
    const snapshot = new BattleSession({ runId: scope.id, stage: STAGES[4] }).snapshot();
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'lost' }); expect(story.currentStory.value).toBeNull();
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'won' }); expect(story.currentStory.value).toBeNull();
    context.profile.rewardWin('boss', '1-5'); const original = gameplay(context);
    context.bridge.emit('battle-snapshot', { ...snapshot, runId: scope.id + 1, status: 'won' }); expect(story.currentStory.value).toBeNull();
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'won' }); expect(story.currentStory.value?.id).toBe('chapter-1');
    story.next(); context.bridge.emit('battle-snapshot', { ...snapshot, status: 'won' }); expect(story.pageIndex.value).toBe(1);
    story.skip(); expect(story.currentStory.value).toBeNull(); context.bridge.emit('battle-snapshot', { ...snapshot, status: 'won' }); expect(story.currentStory.value).toBeNull();
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, stageId: '1-4', phase: 'ready' });
    context.bridge.emit('battle-snapshot', { ...snapshot, stageId: '1-4', status: 'won' }); expect(story.currentStory.value).toBeNull();
    expect(gameplay(context)).toEqual(original); story.dispose(); context.dispose();
  });
  it('replays unlocked episodes into the archive and keeps locked entries/read attempts inert', () => {
    const save = storage(), context = new AppContext(save); context.profile.markStorySeen('prologue');
    const scope = context.lifetimes.begin(scene()), story = createStoryViewModel(context);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    const original = context.profile.snapshot(); const writes = vi.spyOn(save,'setItem'); writes.mockClear();
    story.openArchive(); expect(story.archiveVisible.value).toBe(true);
    story.playUnlockedStory('chapter-1'); expect(story.currentStory.value).toBeNull();
    expect(story.archiveEntries.value.find(entry => entry.id === 'chapter-1')).toMatchObject({ unlocked: false, reason: '1-5 첫 클리어로 해금' });
    story.playUnlockedStory('prologue'); expect(story.origin.value).toBe('archive'); story.next(); story.skip();
    expect(story.archiveVisible.value).toBe(true); expect(story.currentStory.value).toBeNull();
    expect(context.profile.snapshot()).toEqual(original); expect(writes).not.toHaveBeenCalled();
    story.closeArchive(); expect(story.hasOverlay.value).toBe(false); story.dispose(); context.dispose();
  });
  it('cancels at owner shutdown before another scene event and never marks stale reading seen', () => {
    const context = new AppContext(storage()), scope = context.lifetimes.begin(scene()), story = createStoryViewModel(context);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' }); story.next();
    const mark = vi.spyOn(context.profile,'markStorySeen'); scope.dispose();
    expect(story.currentStory.value).toBeNull(); expect(story.hasOverlay.value).toBe(false); story.skip(); story.next(); expect(mark).not.toHaveBeenCalled();
    const nextScope = context.lifetimes.begin(scene()); context.bridge.emit('scene-state', { scene: 'Lobby', runId: nextScope.id, phase: 'ready' });
    expect(story.currentStory.value?.id).toBe('prologue'); expect(story.pageIndex.value).toBe(0);
    story.dispose(); story.skip(); expect(mark).not.toHaveBeenCalled(); context.dispose(); expect(context.bridge.listenerCount).toBe(0);
  });
});

describe('story shell priority and keyboard semantics', () => {
  it('blocks startup/scene navigation while reading and returns to the same rewarded victory after completion', () => {
    const context = new AppContext(storage()), lobbyScope = context.lifetimes.begin(scene()), shell = createShellViewModel(context);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: lobbyScope.id, phase: 'ready' });
    const commands = vi.fn(); const off = context.bridge.subscribe('scene-command', commands);
    shell.enterLobby(); shell.screen.value!.startBattle('1-1'); expect(shell.titleVisible.value).toBe(true); expect(commands).not.toHaveBeenCalled();
    shell.story.skip(); shell.enterLobby(); expect(shell.titleVisible.value).toBe(false);
    for (const stage of STAGES.slice(0,5)) context.profile.rewardWin(stage.id,stage.id);
    lobbyScope.dispose(); const battleScope = context.lifetimes.begin(scene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: battleScope.id, stageId: '1-5', phase: 'ready' });
    context.bridge.emit('battle-result', { runId: battleScope.id, stageId: '1-5', reward: 360, prototypeComplete: false });
    context.bridge.emit('battle-snapshot', { ...new BattleSession({ runId: battleScope.id, stage: STAGES[4] }).snapshot(), status: 'won' });
    const screen = shell.screen.value!; expect(shell.story.currentStory.value?.id).toBe('chapter-1'); expect(screen.reward.value).toBe(360);
    screen.nextStage(); expect(commands).not.toHaveBeenCalled();
    shell.story.skip(); expect(screen.ended.value).toBe(true); expect(screen.hasNextStage.value).toBe(true); expect(screen.reward.value).toBe(360);
    screen.nextStage(); expect(commands).toHaveBeenLastCalledWith({ runId: battleScope.id, command: { type: 'start-battle', stageId: '2-1' } });
    off(); shell.dispose(); context.dispose();
  });
  it('keeps native button Enter single, suppresses native repeat and leaves Tab/system navigation untouched', () => {
    const event = (key: string, repeat = false, ctrlKey = false) => ({ key, repeat, ctrlKey, altKey: false, metaKey: false, preventDefault: vi.fn() });
    const first = event('Enter'); expect(handleStoryKey(first,true,true)).toBeNull(); expect(first.preventDefault).not.toHaveBeenCalled();
    const held = event('Enter',true); expect(handleStoryKey(held,true,true)).toBe('suppress'); expect(held.preventDefault).toHaveBeenCalledOnce();
    const space = event(' ',true); expect(handleStoryKey(space,true,true)).toBe('suppress'); expect(space.preventDefault).toHaveBeenCalledOnce();
    expect(storyKeyAction(event('Enter'),true,false)).toBe('next'); expect(storyKeyAction(event('ArrowLeft'),true,false)).toBe('previous');
    expect(storyKeyAction(event('Escape'),true,false)).toBe('skip'); expect(storyKeyAction(event('Escape'),false,false)).toBe('close');
    for (const key of ['Tab','q','r','v','j']) expect(storyKeyAction(event(key),true,false)).toBeNull();
    expect(storyKeyAction(event('ArrowRight',true),true,false)).toBeNull(); expect(storyKeyAction(event('Enter',false,true),true,true)).toBeNull();
  });
});
