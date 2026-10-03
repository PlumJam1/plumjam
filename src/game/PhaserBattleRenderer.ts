import type Phaser from 'phaser';
import { FIELD } from './battle/balance';
import type { BattleSnapshot, TimedBuffs, UnitState } from './battle/types';

/** Presentation only. All rectangles can be replaced by sprites without changing the rules. */
export class PhaserBattleRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private readonly visibleLabels = new Set<string>();
  constructor(private readonly scene: Phaser.Scene) { this.graphics = scene.add.graphics().setDepth(10); }

  render(snapshot: BattleSnapshot): void {
    const g = this.graphics;
    g.clear();
    this.visibleLabels.clear();
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
    g.fillStyle(hero.hitFlash > 0 ? 0xffffff : 0xf5cba2).fillRect(x - 5, 190, 11, 12);
    g.fillStyle(hero.hitFlash > 0 ? 0xffffff : 0xdf886c).fillRect(x - 7, 202, 16, 17);
    g.fillStyle(0x34415a).fillRect(x - 6, 219, 5, 11).fillRect(x + 4, 219, 5, 11);
    g.fillStyle(0x243044).fillRect(x + 7, 209, 14, 9);
    g.lineStyle(1, 0xf5d59d).strokeTriangle(x - 4, 181, x + 4, 181, x, 186);
    this.health(x, 184, hero.hp, hero.maxHp, 24, 0xf4be79);
    this.buffs(x, 196, hero.buffs, hero.healFlash);
    for (const projectile of snapshot.projectiles) {
      if (projectile.source === 'hero') {
        g.fillStyle(0xffd887).fillRect(Math.round(projectile.x) - 7, 207, 14, 4);
        this.label(`shot-${projectile.id}`, 'Hello, World!', projectile.x, 195, 0xffdf9c);
      } else g.fillStyle(projectile.team === 'human' ? 0xf3e4cc : 0x89e6ea).fillRect(Math.round(projectile.x) - 3, 207, 7, 4);
    }
    for (const [key, label] of this.labels) if (!this.visibleLabels.has(key)) { label.destroy(); this.labels.delete(key); }
  }

  destroy(): void { this.graphics.destroy(); for (const label of this.labels.values()) label.destroy(); this.labels.clear(); }

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
    if (unit.team === 'human') {
      const color = unit.kind === 'melee' ? 0xe2bb80 : unit.kind === 'ranged' ? 0x8fbbbf : 0xcba4cc;
      g.fillStyle(unit.hitFlash > 0 ? 0xffffff : 0xf0c9a8).fillRect(x - 5, y - 32, 10, 10);
      g.fillStyle(unit.hitFlash > 0 ? 0xffffff : color).fillRect(x - 7, y - 22, 15, 14);
      g.fillStyle(0x334052).fillRect(x - 6, y - 8, 5, 8).fillRect(x + 3, y - 8, 5, 8);
      g.fillStyle(unit.kind === 'melee' ? 0x73543b : 0xf0e4cf).fillRect(x + 7, y - 17, 7, 8);
    } else {
      const color = unit.kind === 'robot-ranged' ? 0x7f81b5 : 0x7399a5;
      g.fillStyle(unit.hitFlash > 0 ? 0xffffff : color).fillRect(x - 9, y - 29, 18, 19);
      g.fillStyle(0x132331).fillRect(x - 7, y - 26, 14, 5);
      g.fillStyle(0x89edeb).fillRect(x - 5, y - 24, 3, 2).fillRect(x + 2, y - 24, 3, 2);
      g.fillStyle(0x425b6d).fillRect(x - 7, y - 10, 5, 10).fillRect(x + 2, y - 10, 5, 10);
      if (unit.kind === 'robot-ranged') g.fillStyle(0x485d7d).fillRect(x - 17, y - 19, 9, 5);
    }
    this.buffs(x, y - 32, unit.buffs, unit.healFlash);
    if (unit.slowRemaining > 0) this.label(`sleep-${unit.id}`, 'Zzz', x, y - 45, 0xc9b7fa);
    this.health(x, y - 36, unit.hp, unit.maxHp, 19, unit.team === 'human' ? 0xdfb878 : 0x77b6c1);
  }

  private health(x: number, y: number, hp: number, maxHp: number, width: number, color: number): void {
    this.graphics.fillStyle(0x17222b).fillRect(Math.round(x - width / 2), y, width, 3);
    this.graphics.fillStyle(color).fillRect(Math.round(x - width / 2), y, Math.max(0, width * hp / maxHp), 3);
  }
}
