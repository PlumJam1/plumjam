import Phaser from 'phaser';
import { backgroundArt, characterArt, type ArtKey } from './presentation/assets';
import { drawPlaceholder } from '../scenes/drawPlaceholder';
import { FIELD } from './battle/balance';
import type { BattleSnapshot, TimedBuffs, UnitState } from './battle/types';

/** Scene-owned presentation; app-owned source textures survive scene shutdown. */
export class PhaserBattleRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private readonly visibleLabels = new Set<string>();
  private readonly actors = new Map<number, { image: Phaser.GameObjects.Image; scale: number; lastX: number; dyingAt?: number }>();
  private readonly scenery: Phaser.GameObjects.GameObject[] = [];
  private readonly living = new Set<number>();
  constructor(private readonly scene: Phaser.Scene, theme?: 'early' | 'mid' | 'boss') {
    scene.cameras.main.setBackgroundColor('#233342');
    const key = backgroundArt(theme);
    if (scene.textures.exists(key)) {
      const bg = scene.add.image(320, 140, key).setDepth(-10);
      // Full source, preserve aspect; generated backgrounds were composed for this viewport.
      bg.setScale(Math.min(640 / bg.width, 280 / bg.height));
      this.scenery.push(bg);
      const bases = scene.add.graphics().setDepth(1);
      bases.fillStyle(0xd0a86b).fillRect(25, 167, 57, 63);
      bases.fillStyle(0x77614f).fillRect(20, 159, 67, 9);
      bases.fillStyle(0x453c40).fillRect(46, 197, 18, 33);
      bases.fillStyle(0x131e2b).fillRect(552, 130, 65, 100);
      bases.fillStyle(0x547386).fillRect(548, 122, 73, 8);
      for (let y = 142; y < 215; y += 17) bases.fillStyle(0x75d7db).fillRect(562, y, 45, 3);
      this.scenery.push(bases);
      if (scene.textures.exists('seoultech-symbol')) {
        const logo = scene.add.image(54, 182, 'seoultech-symbol').setDepth(2);
        logo.setScale(Math.min(30 / logo.width, 28 / logo.height)); this.scenery.push(logo);
      }
    } else drawPlaceholder(scene, true);
    this.graphics = scene.add.graphics().setDepth(10);
  }

  render(snapshot: BattleSnapshot): void {
    const g = this.graphics;
    g.clear();
    this.visibleLabels.clear();
    this.living.clear();
    for (const effect of snapshot.effects) {
      const color = effect.kind === 'sleep' ? 0xb4a4ed : effect.kind === 'support-combat' ? 0xefb06a : effect.kind === 'support-speed' ? 0x8fcaee : 0x91d9ad;
      const progress = 1 - effect.remaining / effect.duration;
      g.lineStyle(2, color, (1 - progress) * 0.8).strokeEllipse(Math.round(effect.x), 221, effect.radius * 2 * Math.max(0.1, progress), 38 * progress);
      const text = effect.kind === 'sleep' ? 'sleep()' : effect.kind === 'support-combat' ? 'ATK / DEF UP' : effect.kind === 'support-speed' ? 'SPEED UP' : 'HP UP';
      this.label(`effect-${effect.id}`, text, effect.x, 169 - progress * 8, color, 1 - progress);
    }
    this.health(FIELD.humanBaseX, 149, snapshot.humanBase.hp, snapshot.humanBase.maxHp, 50, 0xf0c28a);
    this.health(FIELD.aiBaseX, 112, snapshot.aiBase.hp, snapshot.aiBase.maxHp, 50, 0x75d7db);
    for (const unit of [...snapshot.units].sort((a, b) => a.x - b.x)) this.unit(unit, snapshot.elapsed);
    const hero = snapshot.hero;
    const x = Math.round(hero.x);
    g.fillStyle(0x000000, 0.3).fillEllipse(x, FIELD.groundY + 1, 23, 5);
    if (hero.hp > 0) this.actor(hero.id, characterArt('hero', hero.level), x, 230, 46, 52, hero.hitFlash > 0, 0, snapshot.elapsed, true);
    g.lineStyle(1, 0xf5d59d).strokeTriangle(x - 4, 170, x + 4, 170, x, 175);
    this.health(x, 177, hero.hp, hero.maxHp, 27, 0xf4be79);
    this.buffs(x, 196, hero.buffs, hero.healFlash);
    for (const projectile of snapshot.projectiles) {
      if (projectile.source === 'hero') {
        g.fillStyle(0xffd887).fillRect(Math.round(projectile.x) - 7, 207, 14, 4);
        this.label(`shot-${projectile.id}`, 'Hello, World!', projectile.x, 195, 0xffdf9c);
      } else g.fillStyle(projectile.team === 'human' ? 0xf3e4cc : 0x89e6ea).fillRect(Math.round(projectile.x) - 3, 207, 7, 4);
    }
    for (const [id, actor] of this.actors) {
      if (this.living.has(id)) continue;
      actor.dyingAt ??= this.scene.time.now / 1000;
      actor.image.setTintMode(Phaser.TintModes.MULTIPLY);
      const fraction = Math.max(0, 1 - (this.scene.time.now / 1000 - actor.dyingAt) / 0.25);
      actor.image.setAlpha(fraction).setScale(actor.scale * fraction);
      if (fraction === 0) { actor.image.destroy(); this.actors.delete(id); }
    }
    for (const [key, label] of this.labels) if (!this.visibleLabels.has(key)) { label.destroy(); this.labels.delete(key); }
  }

  destroy(): void { for (const actor of this.actors.values()) actor.image.destroy(); this.actors.clear(); for (const object of this.scenery) object.destroy(); this.scenery.length = 0; this.graphics.destroy(); for (const label of this.labels.values()) label.destroy(); this.labels.clear(); }

  private label(key: string, value: string, x: number, y: number, color: number, alpha = 1): void {
    this.visibleLabels.add(key);
    let label = this.labels.get(key);
    if (!label) {
      label = this.scene.add.text(0, 0, value, { fontFamily: 'monospace', fontSize: '8px', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#13202d', strokeThickness: 2 }).setOrigin(0.5).setDepth(11);
      this.labels.set(key, label);
    }
    label.setPosition(Math.round(x), Math.round(y)).setAlpha(alpha);
  }

  private buffs(x: number, y: number, buffs: TimedBuffs, healFlash: number): void {
    if (healFlash > 0) this.graphics.fillStyle(0x99edba, Math.min(1, healFlash * 2)).fillRect(x - 1, y - 8, 3, 9).fillRect(x - 4, y - 5, 9, 3);
    if (buffs.combat > 0) this.graphics.lineStyle(1, 0xf0b67f).strokeRect(x - 11, y, 23, 33);
    if (buffs.speed > 0) this.graphics.lineStyle(1, 0x99daf0).strokeTriangle(x - 14, y + 20, x - 10, y + 23, x - 14, y + 26);
  }

  private unit(unit: Readonly<UnitState>, elapsed: number): void {
    const g = this.graphics;
    const x = Math.round(unit.x + (unit.attackFlash > 0 ? (unit.team === 'human' ? 2 : -2) : 0));
    const bob = unit.attackCooldown === 0 ? Math.round(Math.sin(elapsed * 9 + unit.id) * 1.5) : 0;
    const y = 230 + bob;
    g.fillStyle(0x000000, 0.25).fillEllipse(x, 231, 20, 4);
    const boss = unit.kind === 'gpt-4o';
    this.actor(unit.id, characterArt(unit.kind, unit.level), x, y, boss ? 63 : 37, boss ? 78 : 44, unit.hitFlash > 0, unit.attackFlash, elapsed);
    this.buffs(x, y - 32, unit.buffs, unit.healFlash);
    if (unit.slowRemaining > 0) this.label(`sleep-${unit.id}`, 'Zzz', x, y - 45, 0xc9b7fa);
    this.health(x, y - (unit.kind === 'gpt-4o' ? 82 : 48), unit.hp, unit.maxHp, 19, unit.team === 'human' ? 0xdfb878 : 0x77b6c1);
  }

  private actor(id: number, key: ArtKey, x: number, y: number, width: number, height: number, hit: boolean, attack: number, elapsed: number, hero = false): void {
    this.living.add(id);
    if (!this.scene.textures.exists(key)) {
      this.graphics.fillStyle(hero ? 0xedb97b : 0x7eb5bd).fillRect(x - 9, y - height, 18, height); return;
    }
    let actor = this.actors.get(id);
    if (!actor) {
      const image = this.scene.add.image(x, y, key).setOrigin(.5, 1);
      const scale = Math.min(width / image.width, height / image.height);
      actor = { image, scale, lastX: x }; this.actors.set(id, actor);
    }
    const moving = Math.abs(x - actor.lastX) > .03;
    if (hero && moving) actor.image.setFlipX(x < actor.lastX);
    const bob = moving ? Math.sin(elapsed * 10 + id) * 1.2 : 0;
    actor.lastX = x;
    actor.image.setPosition(x, y + bob).setScale(actor.scale).setAngle(attack > 0 ? (key.startsWith('robot') || key === 'boss' ? -5 : 5) : 0).setDepth(hero ? 9 : 4 + x / 1000);
    actor.image.setTint(0xffffff).setTintMode(hit ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY);
  }

  private health(x: number, y: number, hp: number, maxHp: number, width: number, color: number): void {
    this.graphics.fillStyle(0x17222b).fillRect(Math.round(x - width / 2), y, width, 3);
    this.graphics.fillStyle(color).fillRect(Math.round(x - width / 2), y, Math.max(0, width * hp / maxHp), 3);
  }
}
