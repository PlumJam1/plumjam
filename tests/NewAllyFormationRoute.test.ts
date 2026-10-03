import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { createLobbyViewModel } from '../src/ui/viewmodels/LobbyViewModel';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';
const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;

describe('new ally route is a preview, never an automatic saved equip', () => {
  it('selects the existing slot or first empty slot only after an actual unlocked formation route', () => {
    const context = new AppContext(); context.profile.rewardWin('proof', '1-1');
    const scope = context.lifetimes.begin(fakeScene()); context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: 'formation' });
    const before = context.profile.snapshot(); const model = createLobbyViewModel(context, scope, 'formation', 'technician');
    expect(model.selectedAllyKind.value).toBe('technician'); expect(model.selectedSlot.value).toBe(3); expect(context.profile.snapshot()).toEqual(before);
    model.equipAlly('technician'); expect(context.profile.snapshot().equippedAllies[3]).toBe('technician');
    const already = createLobbyViewModel(context, scope, 'formation', 'technician'); expect(already.selectedSlot.value).toBe(3);
    const locked = createLobbyViewModel(context, scope, 'formation', 'judge'); expect(locked.selectedAllyKind.value).toBe('melee'); expect(locked.selectedSlot.value).toBe(0);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id + 1, phase: 'ready' });
    const stale = createLobbyViewModel(context, scope, 'formation', 'technician'); expect(stale.selectedAllyKind.value).toBe('melee');
    context.dispose();
  });
  it('carries a valid unlocked hint through Shell and rejects locked or stale route requests', () => {
    const context = new AppContext(); context.profile.markStorySeen('prologue'); context.profile.rewardWin('proof', '1-1');
    const shell = createShellViewModel(context); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    const screen = shell.screen.value!; const commands = vi.fn(); const off = context.bridge.subscribe('scene-command', commands); const before = context.profile.snapshot();
    screen.openFormation('judge'); expect(commands).not.toHaveBeenCalled();
    screen.openFormation('technician'); expect(commands).toHaveBeenCalledWith({ runId: scope.id, command: { type: 'return-lobby', tab: 'formation', focusAlly: 'technician' } });
    const next = context.lifetimes.begin(fakeScene()); context.bridge.emit('scene-state', { scene: 'Lobby', runId: next.id, phase: 'ready', lobbyTab: 'formation', focusAlly: 'technician' });
    expect(shell.screen.value!.selectedAllyKind.value).toBe('technician'); expect(shell.screen.value!.selectedSlot.value).toBe(3); expect(context.profile.snapshot()).toEqual(before);
    const count = commands.mock.calls.length; screen.openFormation('technician'); expect(commands).toHaveBeenCalledTimes(count);
    shell.screen.value!.openFormation(); expect(commands).toHaveBeenLastCalledWith({ runId: next.id, command: { type: 'return-lobby', tab: 'formation' } });
    shell.dispose(); off(); context.dispose();
  });
});
