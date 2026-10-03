import type Phaser from 'phaser';
import { FIELD } from './battle/balance';
import type { BattleSnapshot, UnitState } from './battle/types';

/** Presentation only. All rectangles can be replaced by sprites without changing the rules. */
export class PhaserBattleRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) { this.graphics = scene.add.graphics().setDepth(10); }

  render(snapshot: BattleSnapshot): void {
    const g = this.graphics;
    g.clear();
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
    for (const projectile of snapshot.projectiles) {
      g.fillStyle(projectile.team === 'human' ? 0xf3e4cc : 0x89e6ea).fillRect(Math.round(projectile.x) - 3, 207, 7, 4);
    }
  }

  destroy(): void { this.graphics.destroy(); }

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
    this.health(x, y - 36, unit.hp, unit.maxHp, 19, unit.team === 'human' ? 0xdfb878 : 0x77b6c1);
  }

  private health(x: number, y: number, hp: number, maxHp: number, width: number, color: number): void {
    this.graphics.fillStyle(0x17222b).fillRect(Math.round(x - width / 2), y, width, 3);
    this.graphics.fillStyle(color).fillRect(Math.round(x - width / 2), y, Math.max(0, width * hp / maxHp), 3);
  }
}
