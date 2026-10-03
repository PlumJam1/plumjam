import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { createGuideViewModel } from '../src/ui/viewmodels/GuideViewModel';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';
const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;

describe('guide reading permissions and owner lifetime', () => {
  it('opens only after Lobby is ready and never commands a scene or changes profile', () => {
    const context = new AppContext(), blocked = shallowRef(false);
    const guide = createGuideViewModel(context, () => blocked.value); const commands = vi.fn();
    const off = context.bridge.subscribe('scene-command', commands); const before = context.profile.snapshot();
    guide.open('help'); expect(guide.isOpen.value).toBe(false);
    const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'loading' }); guide.open('help'); expect(guide.isOpen.value).toBe(false);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' }); guide.open('help'); expect(guide.isOpen.value).toBe(true);
    guide.setMode('credits'); expect(guide.mode.value).toBe('credits');
    blocked.value = true; expect(guide.isOpen.value).toBe(false); guide.open('help'); expect(guide.isOpen.value).toBe(false);
    blocked.value = false; guide.open('credits'); scope.dispose(); expect(guide.isOpen.value).toBe(false);
    guide.open('help'); expect(guide.isOpen.value).toBe(false); expect(context.profile.snapshot()).toEqual(before); expect(commands).not.toHaveBeenCalled();
    guide.dispose(); off(); context.dispose(); expect(context.bridge.listenerCount).toBe(0);
  });
  it('requires an existing pause or result and ignores snapshots from old runs', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const guide = createGuideViewModel(context, () => false); const session = new BattleSession({ runId: scope.id });
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' }); context.bridge.emit('battle-snapshot', session.snapshot());
    guide.open('help'); expect(guide.isOpen.value).toBe(false);
    session.setPaused(true); context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'paused' }); context.bridge.emit('battle-snapshot', session.snapshot());
    const before = session.snapshot(); guide.open('help'); expect(guide.isOpen.value).toBe(true);
    context.bridge.emit('battle-snapshot', { ...before, runId: scope.id + 1, status: 'active' }); expect(guide.isOpen.value).toBe(true);
    guide.close(); expect(session.snapshot()).toEqual(before);
    guide.open('help'); context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' }); expect(guide.isOpen.value).toBe(false);
    context.bridge.emit('battle-snapshot', { ...before, status: 'won' }); guide.open('credits'); expect(guide.isOpen.value).toBe(true);
    const next = context.lifetimes.begin(fakeScene()); context.bridge.emit('scene-state', { scene: 'Lobby', runId: next.id, phase: 'ready' }); expect(guide.isOpen.value).toBe(false);
    context.bridge.emit('battle-snapshot', { ...before, status: 'won' }); guide.open('help'); expect(guide.mode.value).toBe('help');
    guide.dispose(); guide.open('credits'); expect(guide.isOpen.value).toBe(false); context.dispose();
  });
  it('blocks shell navigation under a guide and stops old screen callbacks after a new owner arrives', () => {
    const context = new AppContext(); context.profile.markStorySeen('prologue'); const shell = createShellViewModel(context);
    const scope = context.lifetimes.begin(fakeScene()); context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    const old = shell.screen.value!; const commands = vi.fn(); const off = context.bridge.subscribe('scene-command', commands);
    shell.guide.open('help'); shell.enterLobby(); old.startBattle('1-1'); expect(shell.titleVisible.value).toBe(true); expect(commands).not.toHaveBeenCalled();
    shell.guide.close(); shell.enterLobby(); expect(shell.titleVisible.value).toBe(false);
    const next = context.lifetimes.begin(fakeScene()); context.bridge.emit('scene-state', { scene: 'Lobby', runId: next.id, phase: 'ready' });
    old.startBattle('1-1'); old.openFormation(); expect(commands).not.toHaveBeenCalled();
    shell.screen.value!.startBattle('1-1'); expect(commands).toHaveBeenCalledWith({ runId: next.id, command: { type: 'start-battle', stageId: '1-1' } });
    shell.dispose(); off(); context.dispose();
  });
});
