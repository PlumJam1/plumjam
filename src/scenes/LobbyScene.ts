import Phaser from 'phaser';
import type { AppContext } from '../core/AppContext';
import type { SceneScope } from '../core/SceneLifetimeManager';
import { drawPlaceholder } from './drawPlaceholder';

export class LobbyScene extends Phaser.Scene {
  private scope!: SceneScope;
  private tab: 'menu' | 'stages' | 'training' | 'shop' | 'formation' = 'menu';

  constructor(private readonly context: AppContext) { super('Lobby'); }

  init(data?: { tab?: 'menu' | 'stages' | 'training' | 'shop' | 'formation' }): void { this.scope = this.context.lifetimes.begin(this); this.tab = data?.tab ?? 'menu'; }

  create(): void {
    drawPlaceholder(this, false);
    const scope = this.scope;
    scope.defer(this.context.bridge.subscribe('scene-command', ({ runId, command }) => {
      if (scope.disposed || runId !== scope.id) return;
      if (command.type === 'start-battle' && this.context.stageForBattle(command.stageId)) this.scene.start('Battle', { stageId: command.stageId });
    }));
    this.context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: this.tab });
  }
}
