import Phaser from 'phaser';
import { assetUrl, GENERATED_ASSETS } from '../game/presentation/assets';
import type { AppContext } from '../core/AppContext';
import type { SceneScope } from '../core/SceneLifetimeManager';
import { FIELD } from '../game/battle/balance';

export class BootScene extends Phaser.Scene {
  private scope!: SceneScope;

  constructor(private readonly context: AppContext) { super('Boot'); }

  init(): void {
    this.scope = this.context.lifetimes.begin(this);
    this.context.bridge.emit('scene-state', { scene: 'Boot', runId: this.scope.id, phase: 'loading' });
  }

  preload(): void {
    const loading = this.add.text(FIELD.width / 2, FIELD.height / 2, 'LOADING ART · 0%', { fontFamily: 'monospace', fontSize: '12px', color: '#edc487' }).setOrigin(.5);
    const progress = (value: number) => loading.setText(`LOADING ART · ${Math.round(value * 100)}%`);
    const failed = () => this.context.bridge.emit('asset-notice', '일부 그림을 불러오지 못했어. 기본 표시로 계속 플레이할 수 있어.');
    this.load.on('progress', progress);
    this.load.on('loaderror', failed);
    this.scope.defer(() => { this.load.off('progress', progress); this.load.off('loaderror', failed); });
    for (const key of GENERATED_ASSETS) if (!this.textures.exists(key)) this.load.image(key, assetUrl(key));
    if (!this.textures.exists('human-base')) this.load.image('human-base', `${import.meta.env.BASE_URL}assets/bases/human-base.png`);
    if (!this.textures.exists('human-base-destroyed')) this.load.image('human-base-destroyed', `${import.meta.env.BASE_URL}assets/bases/human-base-destroyed.png`);
    if (!this.textures.exists('enemy-base')) this.load.image('enemy-base', `${import.meta.env.BASE_URL}assets/bases/enemy-base.png`);
    if (!this.textures.exists('enemy-base-destroyed')) this.load.image('enemy-base-destroyed', `${import.meta.env.BASE_URL}assets/bases/enemy-base-destroyed.png`);
    if (!this.textures.exists('enemy-base-chapter-2')) this.load.image('enemy-base-chapter-2', `${import.meta.env.BASE_URL}assets/bases/enemy-base-chapter-2.png`);
    if (!this.textures.exists('enemy-base-chapter-2-destroyed')) this.load.image('enemy-base-chapter-2-destroyed', `${import.meta.env.BASE_URL}assets/bases/enemy-base-chapter-2-destroyed.png`);
    if (!this.textures.exists('enemy-base-3')) this.load.image('enemy-base-3', `${import.meta.env.BASE_URL}assets/bases/enemy-base-3.png`);
    if (!this.textures.exists('enemy-base-3-destroyed')) this.load.image('enemy-base-3-destroyed', `${import.meta.env.BASE_URL}assets/bases/enemy-base-3-destroyed.png`);
    if (!this.textures.exists('seoultech-symbol')) this.load.image('seoultech-symbol', `${import.meta.env.BASE_URL}assets/bases/seoultech-symbol.gif`);
  }

  create(): void { this.scene.start('Lobby'); }
}
