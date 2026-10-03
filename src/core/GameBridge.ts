import type { BattleCommand, BattleSnapshot, CommandResult } from '../game/battle/types';

export type SceneKey = 'Boot' | 'Lobby' | 'Battle';
export type ScenePhase = 'loading' | 'ready' | 'paused';

export interface SceneState {
  readonly scene: SceneKey;
  readonly runId: number;
  readonly phase: ScenePhase;
  readonly stageId?: string;
  readonly lobbyTab?: 'menu' | 'stages' | 'training';
}

export type SceneCommand =
  | { type: 'start-battle'; stageId: string }
  | { type: 'return-lobby'; tab?: 'menu' | 'stages' | 'training' }
  | { type: 'restart-battle' }
  | { type: 'toggle-pause' };

export interface SceneCommandEnvelope {
  readonly runId: number;
  readonly command: SceneCommand;
}

export interface GameBridgeEvents {
  'scene-state': SceneState;
  'scene-command': SceneCommandEnvelope;
  'battle-command': { runId: number; command: BattleCommand };
  'battle-snapshot': BattleSnapshot;
  'battle-feedback': { runId: number; result: CommandResult };
  'battle-result': { runId: number; stageId: string; reward: number; prototypeComplete: boolean };
}

export type Unsubscribe = () => void;

export class GameBridge {
  private readonly listeners = new Map<keyof GameBridgeEvents, Set<(payload: never) => void>>();
  private currentState: SceneState | null = null;

  get sceneState(): SceneState | null { return this.currentState; }

  subscribe<K extends keyof GameBridgeEvents>(event: K, listener: (payload: GameBridgeEvents[K]) => void): Unsubscribe {
    let handlers = this.listeners.get(event);
    if (!handlers) { handlers = new Set(); this.listeners.set(event, handlers); }
    const handler = listener as (payload: never) => void;
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0 && this.listeners.get(event) === handlers) this.listeners.delete(event);
    };
  }

  emit<K extends keyof GameBridgeEvents>(event: K, payload: GameBridgeEvents[K]): void {
    if (event === 'scene-state') this.currentState = payload as SceneState;
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      // A listener may dispose another listener during the same dispatch.
      if (handlers.has(handler)) handler(payload as never);
    }
  }

  clear(): void { this.listeners.clear(); this.currentState = null; }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0);
  }
}
