import Phaser from 'phaser';
import type { AppContext } from '../core/AppContext';
import type { SceneScope } from '../core/SceneLifetimeManager';

export class BootScene extends Phaser.Scene {
  private scope!: SceneScope;

  constructor(private readonly context: AppContext) { super('Boot'); }

  init(): void {
    this.scope = this.context.lifetimes.begin(this);
    this.context.bridge.emit('scene-state', { scene: 'Boot', runId: this.scope.id, phase: 'loading' });
  }

  preload(): void {
    this.load.image('seoultech-symbol', `${import.meta.env.BASE_URL}assets/bases/seoultech-symbol.gif`);
  }

  create(): void { this.scene.start('Lobby'); }
}
