import { GameBridge } from './GameBridge';
import { SceneLifetimeManager } from './SceneLifetimeManager';

/** App-owned services live here; no Scene or GameObject survives a scene run. */
export class AppContext {
  readonly bridge = new GameBridge();
  readonly lifetimes = new SceneLifetimeManager();

  dispose(): void {
    this.lifetimes.disposeAll();
    this.bridge.clear();
  }
}
