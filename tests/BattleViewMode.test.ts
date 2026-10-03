import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import type { BattleViewMode } from '../src/game/presentation/battleCamera';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';

const scene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
describe('run-scoped presentation camera mode', () => {
  it('defaults close and switches active/paused views without battle commands, costs, cooldowns or time', () => {
    const context = new AppContext(), scope = context.lifetimes.begin(scene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    const model = createBattleViewModel(context, scope, false), session = new BattleSession({ runId: scope.id });
    const commands = vi.fn(), views = vi.fn();
    const off = context.bridge.subscribe('battle-command', commands), offView = context.bridge.subscribe('battle-view', views);
    expect(model.viewMode.value).toBe('close'); expect(model.viewDisabled.value).toBe(true);
    model.toggleViewMode(); expect(views).not.toHaveBeenCalled();
    context.bridge.emit('battle-snapshot', session.snapshot()); const before = session.snapshot();
    model.toggleViewMode(); expect(model.viewMode.value).toBe('overview'); expect(model.viewModeLabel.value).toBe('전체 전장');
    expect(views).toHaveBeenLastCalledWith({ runId: scope.id, mode: 'overview' });
    model.setViewMode('close'); expect(model.viewMode.value).toBe('close');
    session.setPaused(true); const paused = session.snapshot(); context.bridge.emit('battle-snapshot', paused);
    model.toggleViewMode(); expect(model.viewMode.value).toBe('overview'); expect(model.viewDisabled.value).toBe(false);
    expect(session.snapshot()).toEqual(paused); expect(before.gold).toBe(paused.gold);
    expect(commands).not.toHaveBeenCalled(); off(); offView(); context.dispose();
  });
  it('ignores invalid modes, ended battles and wrong scene/run envelopes', () => {
    const context = new AppContext(), scope = context.lifetimes.begin(scene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    const model = createBattleViewModel(context, scope, false), snapshot = new BattleSession({ runId: scope.id }).snapshot();
    context.bridge.emit('battle-snapshot', snapshot);
    model.setViewMode('cinematic' as BattleViewMode); expect(model.viewMode.value).toBe('close');
    context.bridge.emit('battle-view', { runId: scope.id + 1, mode: 'overview' }); expect(model.viewMode.value).toBe('close');
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    model.toggleViewMode(); expect(model.viewMode.value).toBe('close');
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    for (const status of ['won', 'lost'] as const) {
      context.bridge.emit('battle-snapshot', { ...snapshot, status }); model.toggleViewMode();
      context.bridge.emit('battle-view', { runId: scope.id, mode: 'overview' });
      expect(model.viewMode.value).toBe('close'); expect(model.viewDisabled.value).toBe(true);
    }
    context.dispose();
  });
  it('starts restart runs close and releases old mode listeners', () => {
    const context = new AppContext(), firstScope = context.lifetimes.begin(scene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: firstScope.id, phase: 'ready' });
    const first = createBattleViewModel(context, firstScope, false);
    context.bridge.emit('battle-snapshot', new BattleSession({ runId: firstScope.id }).snapshot()); first.toggleViewMode();
    expect(first.viewMode.value).toBe('overview'); firstScope.dispose(); first.toggleViewMode();
    const nextScope = context.lifetimes.begin(scene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: nextScope.id, phase: 'ready' });
    const next = createBattleViewModel(context, nextScope, false);
    context.bridge.emit('battle-snapshot', new BattleSession({ runId: nextScope.id }).snapshot());
    context.bridge.emit('battle-view', { runId: firstScope.id, mode: 'overview' });
    expect(next.viewMode.value).toBe('close'); expect(first.viewMode.value).toBe('overview');
    context.dispose(); expect(context.bridge.listenerCount).toBe(0);
  });
});
