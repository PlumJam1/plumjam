import type Phaser from 'phaser';

export interface SceneScope {
  readonly id: number;
  readonly signal: AbortSignal;
  readonly disposed: boolean;
  defer(cleanup: () => void): void;
  dispose(): void;
}

type CleanupErrorHandler = (error: unknown) => void;

class Scope implements SceneScope {
  private readonly controller = new AbortController();
  private cleanups: Array<() => void> = [];
  private finished = false;

  constructor(readonly id: number, private readonly report: CleanupErrorHandler) {}

  get signal(): AbortSignal { return this.controller.signal; }
  get disposed(): boolean { return this.finished; }

  defer(cleanup: () => void): void {
    if (this.finished) this.run(cleanup);
    else this.cleanups.push(cleanup);
  }

  dispose(): void {
    if (this.finished) return;
    this.finished = true;
    this.controller.abort();
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (let index = cleanups.length - 1; index >= 0; index--) this.run(cleanups[index]);
  }

  private run(cleanup: () => void): void {
    try { cleanup(); }
    catch (error) {
      // A faulty cleanup or reporter must not prevent remaining resources being released.
      try { this.report(error); } catch { /* Continue disposing. */ }
    }
  }
}

// Phaser SHUTDOWN ends a run; DESTROY ends the Scene object. PAUSE does neither.
// https://github.com/phaserjs/phaser/blob/v4.2.1/src/scene/Systems.js
export class SceneLifetimeManager {
  private nextId = 1;
  private readonly scopes = new Map<Phaser.Scene, SceneScope>();

  constructor(private readonly report: CleanupErrorHandler = (error) => console.error('Scene cleanup failed', error)) {}

  begin(scene: Phaser.Scene): SceneScope {
    this.dispose(scene);
    const scope = new Scope(this.nextId++, this.report);
    this.scopes.set(scene, scope);
    const end = () => scope.dispose();
    scene.events.once('shutdown', end);
    scene.events.once('destroy', end);
    scope.defer(() => {
      scene.events.off('shutdown', end);
      scene.events.off('destroy', end);
      if (this.scopes.get(scene) === scope) this.scopes.delete(scene);
    });
    return scope;
  }

  dispose(scene: Phaser.Scene): void { this.scopes.get(scene)?.dispose(); }

  getScope(runId: number): SceneScope | undefined {
    return [...this.scopes.values()].find((scope) => scope.id === runId);
  }

  disposeAll(): void {
    for (const scope of [...this.scopes.values()]) scope.dispose();
  }

  get activeCount(): number { return this.scopes.size; }
}
