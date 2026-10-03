import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { GameBridge } from '../src/core/GameBridge';
import { BattleSession } from '../src/game/BattleSession';
import { AppContext } from '../src/core/AppContext';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';

describe('GameBridge and scene ViewModels', () => {
  it('returns idempotent unsubscriptions and retains the latest screen state', () => {
    const bridge = new GameBridge();
    const listener = vi.fn();
    const off = bridge.subscribe('scene-state', listener);
    const state = { scene: 'Lobby', runId: 1, phase: 'ready' } as const;
    bridge.emit('scene-state', state);
    expect(listener).toHaveBeenCalledWith(state);
    expect(bridge.sceneState).toEqual(state);
    off(); off();
    bridge.emit('scene-state', state);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(bridge.listenerCount).toBe(0);
  });

  it('does not deliver to a listener unsubscribed by an earlier callback', () => {
    const bridge = new GameBridge();
    const second = vi.fn();
    let offSecond = () => {};
    bridge.subscribe('scene-state', () => offSecond());
    offSecond = bridge.subscribe('scene-state', second);
    bridge.emit('scene-state', { scene: 'Lobby', runId: 1, phase: 'ready' });
    expect(second).not.toHaveBeenCalled();
  });

  it('invalidates old screen commands on shutdown and creates a fresh ViewModel on restart', () => {
    const context = new AppContext();
    const scene = { events: new EventEmitter() } as unknown as Phaser.Scene;
    const shell = createShellViewModel(context);
    const listener = vi.fn();
    context.bridge.subscribe('scene-command', listener);
    const oldScope = context.lifetimes.begin(scene);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: oldScope.id, stageId: '1-1', phase: 'ready' });
    const oldScreen = shell.screen.value!;
    oldScreen.restartBattle();
    expect(listener).toHaveBeenCalledTimes(1);
    scene.events.emit('shutdown');
    oldScreen.restartBattle();
    expect(listener).toHaveBeenCalledTimes(1);
    const newScope = context.lifetimes.begin(scene);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: newScope.id, stageId: '1-1', phase: 'ready' });
    expect(shell.screen.value).not.toBe(oldScreen);
    shell.screen.value!.restartBattle();
    expect(listener).toHaveBeenLastCalledWith({ runId: newScope.id, command: { type: 'restart-battle' } });
    shell.dispose();
    context.dispose();
    expect(context.bridge.listenerCount).toBe(0);
    expect(context.lifetimes.activeCount).toBe(0);
  });

  it('ignores snapshots from a previous battle run and disposes battle subscriptions', () => {
    const context = new AppContext();
    const scene = { events: new EventEmitter() } as unknown as Phaser.Scene;
    const shell = createShellViewModel(context);
    const oldScope = context.lifetimes.begin(scene);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: oldScope.id, phase: 'ready' });
    const oldSnapshot = new BattleSession({ runId: oldScope.id }).snapshot();
    context.bridge.emit('battle-snapshot', oldSnapshot);
    const oldScreen = shell.screen.value!;
    expect(oldScreen.battle.value?.runId).toBe(oldScope.id);
    scene.events.emit('shutdown');
    const nextScope = context.lifetimes.begin(scene);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: nextScope.id, phase: 'ready' });
    context.bridge.emit('battle-snapshot', oldSnapshot);
    expect(shell.screen.value!.battle.value).toBeNull();
    const listener = vi.fn();
    context.bridge.subscribe('battle-command', listener);
    oldScreen.summon('melee');
    expect(listener).not.toHaveBeenCalled();
    shell.screen.value!.summon('melee');
    expect(listener).toHaveBeenCalledWith({ runId: nextScope.id, command: { type: 'summon', kind: 'melee' } });
    shell.dispose(); context.dispose();
    expect(context.bridge.listenerCount).toBe(0);
  });

});
