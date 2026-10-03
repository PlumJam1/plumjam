import Phaser from 'phaser';
import type { AppContext } from '../core/AppContext';
import type { SceneScope } from '../core/SceneLifetimeManager';
import { drawPlaceholder } from './drawPlaceholder';

export class BattleScene extends Phaser.Scene {
  private scope!: SceneScope;
  private stageId = '1-1';

  constructor(private readonly context: AppContext) { super('Battle'); }

  init(data?: { stageId?: string }): void {
    this.scope = this.context.lifetimes.begin(this);
    this.stageId = data?.stageId ?? '1-1';
  }

  create(): void {
    drawPlaceholder(this, true);
    const scope = this.scope;
    scope.defer(this.context.bridge.subscribe('scene-command', ({ runId, command }) => {
      if (scope.disposed || runId !== scope.id) return;
      if (command.type === 'return-lobby') this.scene.start('Lobby');
      else if (command.type === 'restart-battle') this.scene.restart({ stageId: this.stageId });
      else if (command.type === 'toggle-pause') {
        if (this.scene.isPaused()) this.scene.resume();
        else this.scene.pause();
      }
    }));
    const publish = () => this.context.bridge.emit('scene-state', {
      scene: 'Battle', runId: scope.id, stageId: this.stageId,
      phase: this.scene.isPaused() ? 'paused' : 'ready',
    });
    this.events.on(Phaser.Scenes.Events.PAUSE, publish);
    this.events.on(Phaser.Scenes.Events.RESUME, publish);
    scope.defer(() => {
      this.events.off(Phaser.Scenes.Events.PAUSE, publish);
      this.events.off(Phaser.Scenes.Events.RESUME, publish);
    });
    // DOM input can resume a paused Scene, whose Phaser input plugin stops updating.
    const escape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.repeat || scope.disposed) return;
      event.preventDefault();
      this.context.bridge.emit('scene-command', { runId: scope.id, command: { type: 'toggle-pause' } });
    };
    window.addEventListener('keydown', escape);
    scope.defer(() => window.removeEventListener('keydown', escape));
    const blur = () => { if (!scope.disposed && !this.scene.isPaused()) this.scene.pause(); };
    this.game.events.on(Phaser.Core.Events.BLUR, blur);
    scope.defer(() => this.game.events.off(Phaser.Core.Events.BLUR, blur));
    publish();
  }
}
