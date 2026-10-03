import { DEFAULT_STAGE, ECONOMY, FIELD, HERO, UNIT_DEFINITIONS } from './battle/balance';
import type { AllyKind, BaseState, BattleCommand, BattleSnapshot, BattleStatus, CharacterKind, CommandResult, DefeatReason, HeroState, ProjectileState, StageDefinition, Team, UnitDefinition, UnitKind, UnitState } from './battle/types';

export interface BattleOptions {
  runId: number;
  stage?: StageDefinition;
  levels?: Partial<Record<CharacterKind, number>>;
  unitDefinitions?: Record<UnitKind, UnitDefinition>;
}
type Target = UnitState | HeroState | BaseState;

/** Phaser/Vue-free rules. A Scene owns one session and drops it at shutdown. */
export class BattleSession {
  readonly runId: number;
  readonly stage: StageDefinition;
  private readonly definitions: Record<UnitKind, UnitDefinition>;
  private readonly levels: Partial<Record<CharacterKind, number>>;
  private status: BattleStatus = 'active';
  private defeatReason?: DefeatReason;
  private elapsed = 0;
  private gold: number;
  private economyLevel = 0;
  private direction: -1 | 0 | 1 = 0;
  private nextId = 4;
  private spawnIndex = 0;
  private repeatIndex = 0;
  private disposed = false;
  private readonly hero: HeroState;
  private readonly humanBase: BaseState;
  private readonly aiBase: BaseState;
  private units: UnitState[] = [];
  private projectiles: ProjectileState[] = [];
  private cooldowns: Record<AllyKind, number> = { melee: 0, ranged: 0, support: 0 };

  constructor(options: BattleOptions) {
    this.runId = options.runId;
    this.stage = options.stage ?? DEFAULT_STAGE;
    this.definitions = options.unitDefinitions ?? UNIT_DEFINITIONS;
    this.levels = { ...options.levels };
    this.gold = Math.min(this.stage.initialGold, ECONOMY[0].cap);
    const heroLevel = this.levels.hero ?? 1;
    const hp = HERO.hp * this.levelMultiplier(heroLevel);
    this.hero = { id: 1, x: FIELD.heroStartX, hp, maxHp: hp, level: heroLevel, hitFlash: 0 };
    this.humanBase = { id: 2, team: 'human', x: FIELD.humanBaseX, hp: this.stage.humanBaseHp, maxHp: this.stage.humanBaseHp };
    this.aiBase = { id: 3, team: 'ai', x: FIELD.aiBaseX, hp: this.stage.aiBaseHp, maxHp: this.stage.aiBaseHp };
  }

  dispatch(command: BattleCommand): CommandResult {
    if (this.disposed || this.status !== 'active') return { accepted: false, reason: '전투가 진행 중일 때 사용할 수 있어.' };
    if (command.type === 'move') { this.direction = command.direction; return { accepted: true }; }
    if (command.type === 'skill') return { accepted: false, reason: '스킬은 다음 단계에서 연결돼.' };
    if (command.type === 'upgrade-economy') {
      const cost = ECONOMY[this.economyLevel].upgradeCost;
      if (cost === null) return { accepted: false, reason: '경제가 최대 레벨이야.' };
      if (this.gold < cost) return { accepted: false, reason: '투자할 자금이 부족해.' };
      this.gold -= cost;
      this.economyLevel++;
      return { accepted: true };
    }
    const definition = this.definitions[command.kind];
    if (this.cooldowns[command.kind] > 0) return { accepted: false, reason: '출격 준비 중이야.' };
    if (this.gold < definition.cost!) return { accepted: false, reason: '출격할 자금이 부족해.' };
    // Sequential dispatch makes rapid button/key presses share one authoritative balance.
    this.gold -= definition.cost!;
    this.cooldowns[command.kind] = definition.summonCooldown!;
    this.spawn(command.kind);
    return { accepted: true };
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.status === 'won' || this.status === 'lost') return;
    this.status = paused ? 'paused' : 'active';
    this.direction = 0;
  }

  step(deltaSeconds: number): void {
    if (this.disposed || this.status !== 'active' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    // Small rule steps avoid skipping collision/range checks at a low rendering frame rate.
    let remaining = deltaSeconds;
    while (remaining > 1e-8 && this.status === 'active') {
      const dt = Math.min(remaining, 1 / 60);
      this.tick(dt);
      remaining -= dt;
    }
  }

  snapshot(): BattleSnapshot {
    const economy = ECONOMY[this.economyLevel];
    return {
      runId: this.runId, stageId: this.stage.id, status: this.status, defeatReason: this.defeatReason,
      elapsed: this.elapsed, gold: this.gold, economyLevel: this.economyLevel + 1,
      income: economy.income, goldCap: economy.cap, upgradeCost: economy.upgradeCost,
      hero: { ...this.hero }, humanBase: { ...this.humanBase }, aiBase: { ...this.aiBase },
      units: this.units.map((unit) => ({ ...unit })), projectiles: this.projectiles.map((projectile) => ({ ...projectile })),
      summonCooldowns: { ...this.cooldowns },
    };
  }

  dispose(): void { this.disposed = true; this.direction = 0; this.units = []; this.projectiles = []; }

  private tick(dt: number): void {
    this.elapsed += dt;
    this.gold = Math.min(ECONOMY[this.economyLevel].cap, this.gold + ECONOMY[this.economyLevel].income * dt);
    for (const kind of ['melee', 'ranged', 'support'] as const) this.cooldowns[kind] = Math.max(0, this.cooldowns[kind] - dt);
    this.hero.x = Math.max(FIELD.heroMinX, Math.min(FIELD.heroMaxX, this.hero.x + this.direction * HERO.speed * dt));
    this.hero.hitFlash = Math.max(0, this.hero.hitFlash - dt);
    this.spawnScheduled();
    const hits: Array<{ target: Target; damage: number }> = [];
    const living = this.units.filter((unit) => unit.hp > 0);
    // Collect all same-step damage before applying it; defeat takes priority over a simultaneous win.
    this.projectiles = this.projectiles.filter((projectile) => {
      const travel = Math.min(projectile.remainingRange, projectile.speed * dt);
      const nextX = projectile.x + projectile.direction * travel;
      const targets = this.targets(projectile.team).filter((target) => {
        const distance = (target.x - projectile.x) * projectile.direction;
        return distance >= -5 && distance <= travel + 5;
      }).sort((a, b) => (a.x - b.x) * projectile.direction || a.id - b.id);
      if (targets[0]) { hits.push({ target: targets[0], damage: projectile.damage }); return false; }
      projectile.x = nextX;
      projectile.remainingRange -= travel;
      return projectile.remainingRange > 0 && nextX >= 0 && nextX <= FIELD.width;
    });
    for (const unit of living) {
      const definition = this.definitions[unit.kind];
      unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
      unit.hitFlash = Math.max(0, unit.hitFlash - dt);
      unit.attackFlash = Math.max(0, unit.attackFlash - dt);
      const target = this.nearestTarget(unit);
      const gap = Math.abs(target.x - unit.x);
      if (gap <= definition.range) {
        if (definition.damage > 0 && unit.attackCooldown <= 0) {
          unit.attackCooldown = definition.attackInterval;
          unit.attackFlash = 0.18;
          const damage = definition.damage * this.levelMultiplier(unit.level);
          if (definition.projectileSpeed) {
            this.projectiles.push({ id: this.nextId++, source: unit.kind, team: unit.team, x: unit.x,
              direction: target.x >= unit.x ? 1 : -1, speed: definition.projectileSpeed,
              damage, remainingRange: definition.range + 20 });
          } else hits.push({ target, damage });
        }
      } else {
        const direction = target.x >= unit.x ? 1 : -1;
        unit.x += direction * Math.min(definition.speed * dt, gap - definition.range);
      }
    }
    for (const hit of hits) {
      hit.target.hp = Math.max(0, hit.target.hp - hit.damage);
      if ('hitFlash' in hit.target) hit.target.hitFlash = 0.18;
    }
    this.units = this.units.filter((unit) => unit.hp > 0);
    if (this.hero.hp <= 0 || this.humanBase.hp <= 0) {
      this.status = 'lost';
      this.defeatReason = this.hero.hp <= 0 ? 'hero' : 'base';
      this.direction = 0;
    } else if (this.aiBase.hp <= 0) { this.status = 'won'; this.direction = 0; }
  }

  private targets(team: Team): Target[] {
    const opposingUnits = this.units.filter((unit) => unit.team !== team && unit.hp > 0);
    if (team === 'ai' && this.hero.hp > 0) return [...opposingUnits, this.hero, this.humanBase];
    return [...opposingUnits, team === 'human' ? this.aiBase : this.humanBase];
  }

  private nearestTarget(unit: UnitState): Target {
    // Bases compete by distance too. A surviving hero elsewhere cannot shield a nearby base.
    const targets = this.targets(unit.team);
    return targets.reduce((best, candidate) => {
      const candidateDistance = Math.abs(candidate.x - unit.x);
      const bestDistance = Math.abs(best.x - unit.x);
      return candidateDistance < bestDistance || (candidateDistance === bestDistance && candidate.id < best.id) ? candidate : best;
    });
  }

  private spawn(kind: UnitKind): void {
    const definition = this.definitions[kind];
    const level = definition.team === 'human' ? this.levels[kind as AllyKind] ?? 1 : 1;
    const hp = definition.hp * this.levelMultiplier(level);
    this.units.push({ id: this.nextId++, kind, team: definition.team, level,
      x: definition.team === 'human' ? FIELD.humanSpawnX : FIELD.aiSpawnX,
      hp, maxHp: hp, attackCooldown: 0, hitFlash: 0, attackFlash: 0 });
  }

  private spawnScheduled(): void {
    while (this.spawnIndex < this.stage.spawns.length && this.stage.spawns[this.spawnIndex].at <= this.elapsed) {
      this.spawn(this.stage.spawns[this.spawnIndex++].kind);
    }
    const repeat = this.stage.repeat;
    if (repeat && repeat.interval > 0 && repeat.kinds.length) {
      while (repeat.startAt + this.repeatIndex * repeat.interval <= this.elapsed) {
        this.spawn(repeat.kinds[this.repeatIndex % repeat.kinds.length]);
        this.repeatIndex++;
      }
    }
  }

  private levelMultiplier(level: number): number { return 1 + (level - 1) * 0.15; }
}
