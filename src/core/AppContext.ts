import { SoundService } from '../game/presentation/SoundService';
import { GameBridge } from './GameBridge';
import { SceneLifetimeManager } from './SceneLifetimeManager';
import { browserStorage, ProfileService, type SaveStorage } from '../game/progression/ProfileService';
import { getStage } from '../game/progression/stages';

/** App-owned services live here; no Scene or GameObject survives a scene run. */
export class AppContext {
  readonly sound = new SoundService();
  private readonly unsubscribeAudio: () => void;
  readonly bridge = new GameBridge();
  readonly lifetimes = new SceneLifetimeManager();
  readonly profile: ProfileService;
  private receipt = 0;

  constructor(storage: SaveStorage | undefined = browserStorage()) {
    this.profile = new ProfileService(storage);
    this.unsubscribeAudio = this.profile.subscribe(profile => this.sound.setMuted(profile.muted));
  }

  stageForBattle(id: string) { return this.profile.canStart(id) ? getStage(id) : undefined; }
  newBattleReceipt(): string { return `battle-${++this.receipt}`; }

  dispose(): void {
    this.lifetimes.disposeAll();
    this.bridge.clear();
    this.unsubscribeAudio();
    this.sound.dispose();
    this.profile.dispose();
  }
}
