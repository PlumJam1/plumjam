import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { SceneLifetimeManager } from '../src/core/SceneLifetimeManager';

const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;

describe('SceneLifetimeManager', () => {
  it('aborts once and runs all cleanup in reverse order even when one fails', () => {
    const report = vi.fn();
    const manager = new SceneLifetimeManager(report);
    const scene = fakeScene();
    const scope = manager.begin(scene);
    const called: number[] = [];
    const aborted = vi.fn();
    scope.signal.addEventListener('abort', aborted);
    scope.defer(() => called.push(1));
    scope.defer(() => { called.push(2); throw new Error('failed'); });
    scope.defer(() => called.push(3));
    scene.events.emit('shutdown');
    scene.events.emit('destroy');
    scope.dispose();
    expect(called).toEqual([3, 2, 1]);
    expect(scope.disposed).toBe(true);
    expect(scope.signal.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(manager.activeCount).toBe(0);
  });

  it('uses fresh IDs for ten restarts without accumulating lifecycle listeners', () => {
    const manager = new SceneLifetimeManager();
    const scene = fakeScene();
    const ids = new Set<number>();
    for (let index = 0; index < 10; index++) {
      const scope = manager.begin(scene);
      ids.add(scope.id);
      expect(scene.events.listenerCount('shutdown')).toBe(1);
      expect(scene.events.listenerCount('destroy')).toBe(1);
      scene.events.emit('pause');
      expect(scope.disposed).toBe(false);
      scene.events.emit('shutdown');
      expect(scene.events.listenerCount('shutdown')).toBe(0);
      expect(scene.events.listenerCount('destroy')).toBe(0);
    }
    expect(ids.size).toBe(10);
    expect(manager.activeCount).toBe(0);
  });

  it('disposes an old run before begin and executes late registrations immediately', () => {
    const manager = new SceneLifetimeManager();
    const scene = fakeScene();
    const old = manager.begin(scene);
    const cleanup = vi.fn();
    old.defer(cleanup);
    const current = manager.begin(scene);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(old.disposed).toBe(true);
    expect(current.disposed).toBe(false);
    old.defer(cleanup);
    expect(cleanup).toHaveBeenCalledTimes(2);
    manager.disposeAll();
    expect(current.disposed).toBe(true);
  });
});
