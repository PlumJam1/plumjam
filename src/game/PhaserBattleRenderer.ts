import Phaser from 'phaser';
import { backgroundArt, characterArt, type ArtKey } from './presentation/assets';
import { drawPlaceholder } from '../scenes/drawPlaceholder';
import { FIELD } from './battle/balance';
import type { BattleSnapshot, SkillKind, TimedBuffs, UnitState } from './battle/types';
import { skillPreview } from './presentation/battlePresentation';

/** Scene-owned presentation; app-owned source textures survive scene shutdown. */
export class PhaserBattleRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly groundGraphics: Phaser.GameObjects.Graphics;
  private previewSkill: SkillKind | null = null;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private readonly visibleLabels = new Set<string>();
  private readonly actors = new Map<number, { image: Phaser.GameObjects.Image; scale: number; lastX: number; dyingAt?: number }>();
  private readonly scenery: Phaser.GameObjects.GameObject[] = [];
  private readonly living = new Set<number>();
  constructor(private readonly scene: Phaser.Scene, theme?: 'early' | 'mid' | 'boss', stageId?: string) {
    scene.cameras.main.setBackgroundColor('#233342');
    const useEnemyBaseImage = ['1-1', '1-2', '1-3', '1-4'].includes(stageId ?? '') && scene.textures.exists('enemy-base');
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
      if (!useEnemyBaseImage) {
        bases.fillStyle(0x131e2b).fillRect(552, 130, 65, 100);
        bases.fillStyle(0x547386).fillRect(548, 122, 73, 8);
        for (let y = 142; y < 215; y += 17) bases.fillStyle(0x75d7db).fillRect(562, y, 45, 3);
      }
      this.scenery.push(bases);
      if (scene.textures.exists('seoultech-symbol')) {
        const logo = scene.add.image(54, 182, 'seoultech-symbol').setDepth(2);
        logo.setScale(Math.min(30 / logo.width, 28 / logo.height)); this.scenery.push(logo);
      }
    } else drawPlaceholder(scene, true, !useEnemyBaseImage);
    if (useEnemyBaseImage) {
      const base = scene.add.image(FIELD.aiBaseX, FIELD.groundY, 'enemy-base').setOrigin(.5, 1).setDepth(1);
      base.setScale(Math.min(112 / base.width, 112 / base.height));
      this.scenery.push(base);
    }
    this.graphics = scene.add.graphics().setDepth(10);
    this.groundGraphics = scene.add.graphics().setDepth(2);
  }

  setPreview(skill: SkillKind | null): void { this.previewSkill = skill; }

  render(snapshot: BattleSnapshot): void {
    const g = this.graphics;
    g.clear();
    this.groundGraphics.clear();
    if (snapshot.status !== 'active') this.previewSkill = null;
    this.visibleLabels.clear();
    this.living.clear();
    const preview = skillPreview(snapshot, this.previewSkill);
    if (preview) {
      const color = preview.skill === 'hello-world' ? 0xffdf9c : preview.skill === 'sleep' ? 0xd5b6ff : preview.skill === 'git-push' ? 0x89dfff : 0x9cf3ba;
      if (preview.shape === 'line') {
        g.lineStyle(2, color, .85).lineBetween(preview.x, 244, preview.endX, 244);
        g.fillStyle(color, .9).fillTriangle(preview.endX, 244, preview.endX - 7, 240, preview.endX - 7, 248);
      } else {
        this.groundGraphics.fillStyle(color, .1).fillCircle(preview.x, FIELD.groundY, preview.radius);
        this.groundGraphics.lineStyle(2, color, .85).strokeCircle(preview.x, FIELD.groundY, preview.radius);
      }
      for (const id of preview.targetIds) {
        const target = id === snapshot.hero.id ? snapshot.hero : id === snapshot.aiBase.id ? snapshot.aiBase : snapshot.units.find(unit => unit.id === id);
        if (target) g.lineStyle(2, color).strokeEllipse(target.x, 229, 34, 10);
      }
      for (const destination of preview.destinations) {
        g.lineStyle(1, color, .9).lineBetween(destination.from, 235, destination.x, 235);
        g.lineStyle(2, color, .9).strokeRect(destination.x - destination.bodyWidth / 2, 213, destination.bodyWidth, 20);
        g.fillStyle(color, .9).fillTriangle(destination.x, 235, destination.x - 5, 232, destination.x - 5, 238);
      }
    }
    for (const telegraph of snapshot.bossTelegraphs) {
      const ground = this.groundGraphics;
      const progress = 1 - telegraph.remaining / telegraph.duration;
      ground.fillStyle(0xff6a45, .2 + progress * .2).fillRect(telegraph.x - telegraph.radius, 216, telegraph.radius * 2, 17);
      ground.lineStyle(2, 0xffcb73).strokeRect(telegraph.x - telegraph.radius, 216, telegraph.radius * 2, 17);
      for (let x = telegraph.x - telegraph.radius + 5; x < telegraph.x + telegraph.radius; x += 16) ground.lineStyle(1, 0xffcb73, .65).lineBetween(x, 232, x + 12, 217);
      g.fillStyle(0x291e27).fillRect(telegraph.x - 28, 203, 56, 3);
      g.fillStyle(0xffae6b).fillRect(telegraph.x - 28, 203, 56 * progress, 3);
      this.label(`boss-cast-${telegraph.ownerId}`, `범위 공격 ${telegraph.remaining.toFixed(1)}초`, telegraph.x, 196, 0xffdf8f);
    }
    for (const effect of snapshot.effects) {
      if (effect.kind === 'hello-impact') {
        const progress = 1 - effect.remaining / effect.duration;
        const distance = effect.radius * (1 - Math.pow(1 - progress, 2));
        const characters = ['H', 'W', 'o', 'H', 'W', 'o'];
        for (let i = 0; i < characters.length; i++) {
          const angle = i * Math.PI * 2 / characters.length - Math.PI / 2;
          this.label(`impact-${effect.id}-${i}`, characters[i],
            effect.x + Math.cos(angle) * distance,
            195 + Math.sin(angle) * distance + 12 * progress * progress,
            0xffdf9c, 1 - progress);
        }
        continue;
      }
      if (effect.kind === 'git-push' || effect.kind === 'overclock') {
        const alpha = effect.remaining / effect.duration;
        const radius = effect.kind === 'git-push' ? effect.radius : 30 + (1 - alpha) * 20;
        const color = effect.kind === 'git-push' ? 0x89dfff : 0xffda79;
        g.lineStyle(2, color, alpha).strokeEllipse(effect.x, 216, radius * 2 * (1 - alpha * .5), 26);
        this.label(`effect-${effect.id}`, effect.kind === 'git-push' ? 'git push >>' : 'overclock()', effect.x, 166, color, alpha);
        continue;
      }
      if (effect.kind === 'boss-blast') {
        const alpha = effect.remaining / effect.duration;
        this.groundGraphics.fillStyle(0xff6a45, alpha * .65).fillRect(effect.x - effect.radius, 216, effect.radius * 2, 17);
        g.lineStyle(3, 0xffddb2, alpha).strokeEllipse(effect.x, 221, effect.radius * 2, 26);
        continue;
      }
      const color = effect.kind === 'sleep' ? 0xb4a4ed : effect.kind === 'support-combat' ? 0xefb06a : effect.kind === 'support-haste' || effect.kind === 'support-speed' ? 0x8fcaee : 0x91d9ad;
      const progress = 1 - effect.remaining / effect.duration;
      g.lineStyle(2, color, (1 - progress) * 0.8).strokeEllipse(Math.round(effect.x), 221, effect.radius * 2 * Math.max(0.1, progress), 38 * progress);
      const text = effect.kind === 'sleep' ? 'sleep()' : effect.kind === 'support-haste' ? 'ATK SPEED UP' : effect.kind === 'support-combat' ? 'ATK / DEF UP' : effect.kind === 'support-speed' ? 'SPEED UP' : 'HP UP';
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
    this.buffs(x, 196, hero.buffs);
    this.healing(hero.id, x, 160, hero.healFlash);
    for (const projectile of snapshot.projectiles) {
      if (projectile.source === 'hero') {
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

  destroy(): void { this.previewSkill = null; for (const actor of this.actors.values()) actor.image.destroy(); this.actors.clear(); for (const object of this.scenery) object.destroy(); this.scenery.length = 0; this.graphics.destroy(); this.groundGraphics.destroy(); for (const label of this.labels.values()) label.destroy(); this.labels.clear(); }

  private label(key: string, value: string, x: number, y: number, color: number, alpha = 1, fontSize = 8): void {
    this.visibleLabels.add(key);
    let label = this.labels.get(key);
    if (!label) {
      label = this.scene.add.text(0, 0, value, { fontFamily: 'monospace', fontSize: `${fontSize}px`, color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#13202d', strokeThickness: 2 }).setOrigin(0.5).setDepth(11);
      this.labels.set(key, label);
    }
    label.setText(value).setPosition(Math.round(x), Math.round(y)).setAlpha(alpha);
  }

  private healing(id: number, x: number, headY: number, remaining: number): void {
    if (remaining <= 0) return;
    const progress = 1 - Math.min(1, remaining / 0.5);
    const alpha = 1 - progress;
    const y = Math.round(headY - progress * 14);
    const billX = Math.round(x) - 13;
    const g = this.graphics;
    // Draw a banknote icon rather than relying on platform-specific emoji fonts.
    g.fillStyle(0x173f2c, alpha).fillRect(billX - 1, y - 6, 22, 12);
    g.fillStyle(0x9de0a6, alpha).fillRect(billX, y - 5, 20, 10);
    g.lineStyle(1, 0x397b4a, alpha).strokeRect(billX + 2, y - 3, 16, 6);
    g.fillStyle(0xc8f3bd, alpha).fillEllipse(billX + 10, y, 8, 8);
    this.label(`heal-dollar-${id}`, '$', billX + 10, y, 0x245b36, alpha);
    this.label(`heal-plus-${id}`, '+', x + 13, y, 0xc8f3bd, alpha);
  }

  private buffs(x: number, y: number, buffs: TimedBuffs): void {
    if (buffs.haste > 0) this.graphics.lineStyle(1, 0x99daf0).strokeTriangle(x + 11, y + 12, x + 16, y + 17, x + 11, y + 22);
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
    this.actor(unit.id, characterArt(unit.kind, unit.level), x, y, unit.bodyWidth, boss ? 78 : 44, unit.hitFlash > 0, unit.attackFlash, elapsed, false, true);
    if (unit.kind === 'robot-heavy') {
      if (unit.hitFlash <= 0) this.actors.get(unit.id)?.image.setTint(0x9eabc0);
      this.label(`heavy-${unit.id}`, '중장갑', x, y - 64, 0xc5d1e4);
    }
    if (unit.kind === 'robot-runner') {
      const image = this.actors.get(unit.id)?.image;
      if (unit.hitFlash <= 0) image?.setTint(0xffaa86);
      g.lineStyle(1, 0xffb18a, .85).lineBetween(x + 14, y - 18, x + 25, y - 18).lineBetween(x + 15, y - 12, x + 30, y - 12);
      this.label(`runner-${unit.id}`, '긴급 배포', x, y - 59, 0xffbf95);
    }
    this.buffs(x, y - 32, unit.buffs);
    this.healing(unit.id, x, y - (boss ? 93 : 59), unit.healFlash);
    if (unit.team === 'ai' && unit.slowRemaining > 0) {
      this.label(`sleep-${unit.id}`, `감속 ${unit.slowRemaining.toFixed(1)}초`, x, y - 45, 0xc9b7fa);
      // Simulation time keeps the small floating loop frozen during pause.
      const rise = ((elapsed + unit.id * .17) % 1.2) / 1.2;
      this.label(`sleep-zzz-${unit.id}`, 'Zzz', x - unit.bodyWidth / 2 - 12, y - (boss ? 104 : 76) - rise * 8, 0xd5c5ff, 1 - rise * .45, 10);
    }
    else if (unit.buffs.haste > 0) this.label(`buff-${unit.id}`, `공속 ${unit.buffs.haste.toFixed(1)}초`, x, y - 45, 0xa7e6ff);
    else if (unit.buffs.combat > 0) this.label(`buff-${unit.id}`, `공격/방어 ${unit.buffs.combat.toFixed(1)}초`, x, y - 45, 0xffc995);
    else if (unit.buffs.speed > 0) this.label(`buff-${unit.id}`, `이동 ${unit.buffs.speed.toFixed(1)}초`, x, y - 45, 0xa7e6ff);
    this.health(x, y - (unit.kind === 'gpt-4o' ? 82 : 48), unit.hp, unit.maxHp, 19, unit.team === 'human' ? 0xdfb878 : 0x77b6c1);
  }

  private actor(id: number, key: ArtKey, x: number, y: number, width: number, height: number, hit: boolean, attack: number, elapsed: number, hero = false, exactWidth = false): void {
    this.living.add(id);
    if (!this.scene.textures.exists(key)) {
      const placeholderWidth = exactWidth ? width : 18;
      this.graphics.fillStyle(hero ? 0xedb97b : 0x7eb5bd).fillRect(x - placeholderWidth / 2, y - height, placeholderWidth, height); return;
    }
    let actor = this.actors.get(id);
    if (!actor) {
      const image = this.scene.add.image(x, y, key).setOrigin(.5, 1);
      const scale = exactWidth ? width / image.width : Math.min(width / image.width, height / image.height);
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
