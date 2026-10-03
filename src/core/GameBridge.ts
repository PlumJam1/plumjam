import type { BattleViewMode } from '../game/presentation/battleCamera';
import type { AllyKind, BattleCommand, BattleSnapshot, CommandResult, SkillKind } from '../game/battle/types';

export type SceneKey = 'Boot' | 'Lobby' | 'Battle';
export type ScenePhase = 'loading' | 'ready' | 'paused';

export interface SceneState {
  readonly scene: SceneKey;
  readonly runId: number;
  readonly phase: ScenePhase;
  readonly stageId?: string;
  readonly lobbyTab?: 'menu' | 'stages' | 'training' | 'shop' | 'formation';
}

export type SceneCommand =
  | { type: 'start-battle'; stageId: string }
  | { type: 'return-lobby'; tab?: 'menu' | 'stages' | 'training' | 'shop' | 'formation' }
  | { type: 'restart-battle' }
  | { type: 'toggle-pause' };

export interface SceneCommandEnvelope {
  readonly runId: number;
  readonly command: SceneCommand;
}

export interface GameBridgeEvents {
  'asset-notice': string;
  'scene-state': SceneState;
  'scene-command': SceneCommandEnvelope;
  'battle-command': { runId: number; command: BattleCommand };
  /** Presentation-only intent; never spends gold or dispatches a skill. */
  'battle-preview': { runId: number; skill: SkillKind | null };
  /** Presentation-only summon-card page; authoritative battle state does not change. */
  'battle-page': { runId: number; page: 0 | 1 };
  /** Camera-only intent; never changes the simulation, cost or cooldowns. */
  'battle-view': { runId: number; mode: BattleViewMode };
  'battle-snapshot': BattleSnapshot;
  'battle-feedback': { runId: number; result: CommandResult };
  'battle-result': { runId: number; stageId: string; reward: number; prototypeComplete: boolean; firstClear?: boolean; newlyUnlockedAllies?: readonly AllyKind[] };
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
