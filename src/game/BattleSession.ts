import { ALLY_KINDS, FORMATION_SIZE, STARTER_ALLIES, BOSS, DEFAULT_STAGE, DEFAULT_UNLOCKED_SKILLS, ECONOMY, FIELD, HERO, JUDGE, SKILLS, SKILL_SLOT_COUNT, SONG, SUPPORT, UNIT_DEFINITIONS, WATER } from './battle/balance';
import type { AllyKind, BaseState, BattleCommand, BattleSnapshot, BattleSpeed, BattleStatus, BossTelegraphState, CharacterKind, CommandResult, DefeatReason, EffectKind, EffectState, ForeachFlightState, HeroState, JudgeAttackState, ProjectileState, SkillKind, StageDefinition, Team, UnitDefinition, UnitKind, UnitState, WaterChannelState } from './battle/types';
import { levelMultiplier } from './progression/ProfileService';

export interface BattleOptions {
  runId: number;
  stage?: StageDefinition;
  levels?: Partial<Record<CharacterKind, number>>;
  random?: () => number;
  unitDefinitions?: Record<UnitKind, UnitDefinition>;
  unlockedSkills?: readonly SkillKind[];
  equippedSkills?: readonly SkillKind[];
  equippedAllies?: readonly (AllyKind | null)[];
  unlockedAllies?: readonly AllyKind[];
}
type Target = UnitState | HeroState | BaseState;
type PendingBoss = BossTelegraphState & { damage: number };
type PendingJudge = JudgeAttackState & { damage: number };
type PendingWater = WaterChannelState & { damage: number; untilTick: number; ticksRemaining: number };
type PendingForeach = ForeachFlightState & { damage: number };

/** Shared lane collision order: forward distance first, then stable entity ID. */
export function getProjectileTarget<T extends { id: number; x: number }>(targets: readonly T[], projectile: Pick<ProjectileState, 'x' | 'direction' | 'source'>, travel: number): T | undefined {
  return targets.filter(target => {
    const distance = (target.x - projectile.x) * projectile.direction;
    return distance >= (projectile.source === 'hero' ? 0 : -5) && distance <= travel + 5;
  }).sort((a, b) => (a.x - b.x) * projectile.direction || a.id - b.id)[0];
}

/** Shared by the actual cast and UI preview so level/buff numbers cannot drift. */
export function getSkillValues(hero: Pick<HeroState, 'level' | 'buffs'>) {
  return {
    helloDamage: SKILLS['hello-world'].damage * levelMultiplier(hero.level) * (hero.buffs.combat > 0 ? SUPPORT.damageMultiplier : 1),
    helloRange: SKILLS['hello-world'].range,
    sleepRadius: SKILLS.sleep.radius, sleepDuration: SKILLS.sleep.duration, sleepSpeedMultiplier: SKILLS.sleep.speedMultiplier,
    healAmount: SKILLS.heal.amount * levelMultiplier(hero.level), healRadius: SKILLS.heal.radius,
    pushRadius: SKILLS['git-push'].radius, overclockDuration: SKILLS.overclock.duration,
    foreachDamage: SKILLS.foreach.damage * levelMultiplier(hero.level) * (hero.buffs.combat > 0 ? SUPPORT.damageMultiplier : 1),
    foreachRadius: SKILLS.foreach.radius, foreachOffset: SKILLS.foreach.forwardOffset, foreachFlight: SKILLS.foreach.flightDuration,
  };
}

/** Converts base cooldown work into simulation seconds, accounting for buff expiry. */
export function getCooldownEta(baseRemaining: number, overclockRemaining: number, excluded = false): number {
  if (excluded) return baseRemaining;
  return baseRemaining <= 2 * overclockRemaining ? baseRemaining / 2 : baseRemaining - overclockRemaining;
}

export function getPushDestination(unit: Pick<UnitState, 'x' | 'kind' | 'bodyWidth'>, boundaryX: number = FIELD.aiBaseX): number {
  return Math.max(unit.x, Math.min(boundaryX - unit.bodyWidth / 2, unit.x + unit.bodyWidth * (unit.kind === 'gpt-4o' ? 1 : 3)));
}

/** Keyboard slots read the immutable battle formation, including empty slots. */
export function getFormationCommand(equipped: readonly (AllyKind | null)[], slot: number): BattleCommand | undefined {
  const kind = Number.isInteger(slot) && slot >= 0 && slot < FORMATION_SIZE ? equipped[slot] : null;
  return kind ? { type: 'summon', kind } : undefined;
}

/** Phaser/Vue-free rules. A Scene owns one session and drops it at shutdown. */
export class BattleSession {
  readonly runId: number;
  readonly stage: StageDefinition;
  private readonly definitions: Record<UnitKind, UnitDefinition>;
  private readonly levels: Record<CharacterKind, number>;
  private readonly equippedAllies: readonly (AllyKind | null)[];
  private readonly unlockedAllies: readonly AllyKind[];
  private readonly unlockedSkills: readonly SkillKind[];
  private readonly equippedSkills: readonly SkillKind[];
  private speed: BattleSpeed = 1;
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
  private pushes = new Map<number, { destination: number; speed: number }>();
  private projectiles: ProjectileState[] = [];
  private effects: EffectState[] = [];
  private bossTelegraphs: PendingBoss[] = [];
  private judgeAttacks: PendingJudge[] = [];
  private waterChannels: PendingWater[] = [];
  private foreachFlights: PendingForeach[] = [];
  private defeatedBossCount = 0;
  private overclockRemaining = 0;
  private skillCooldowns: Record<SkillKind, number> = { 'hello-world': 0, sleep: 0, heal: 0, 'git-push': 0, overclock: 0, foreach: 0 };
  private cooldowns = Object.fromEntries(ALLY_KINDS.map(kind => [kind, 0])) as Record<AllyKind, number>;

  constructor(options: BattleOptions) {
    this.runId = options.runId;
    this.stage = options.stage ?? DEFAULT_STAGE;
    this.definitions = options.unitDefinitions ?? UNIT_DEFINITIONS;
    this.levels = Object.fromEntries((['hero', ...ALLY_KINDS] as CharacterKind[]).map(kind => [kind, options.levels?.[kind] ?? 1])) as Record<CharacterKind, number>;
    this.unlockedSkills = [...new Set(options.unlockedSkills ?? DEFAULT_UNLOCKED_SKILLS)].filter(skill => Object.prototype.hasOwnProperty.call(SKILLS, skill));
    const chosenSkills = options.equippedSkills ?? (Object.keys(SKILLS) as SkillKind[]).filter(skill => this.unlockedSkills.includes(skill));
    this.equippedSkills = [...new Set(chosenSkills)].filter(skill => this.unlockedSkills.includes(skill)).slice(0, SKILL_SLOT_COUNT);
    this.unlockedAllies = [...new Set(options.unlockedAllies ?? STARTER_ALLIES)].filter(kind => ALLY_KINDS.includes(kind));
    const chosen = options.equippedAllies ?? [...STARTER_ALLIES, null, null];
    const seen = new Set<AllyKind>();
    this.equippedAllies = Array.from({ length: FORMATION_SIZE }, (_, index) => {
      const kind = chosen[index];
      if (!kind || !this.unlockedAllies.includes(kind) || seen.has(kind)) return null;
      seen.add(kind); return kind;
    });
    this.gold = Math.min(this.stage.initialGold, ECONOMY[0].cap);
    const heroLevel = this.levels.hero ?? 1;
    const hp = HERO.hp * this.levelMultiplier(heroLevel);
    this.hero = { id: 1, x: FIELD.heroStartX, hp, maxHp: hp, level: heroLevel, hitFlash: 0, healFlash: 0, buffs: { combat: 0, speed: 0, haste: 0 } };
    this.humanBase = { id: 2, team: 'human', x: FIELD.humanBaseX, hp: this.stage.humanBaseHp, maxHp: this.stage.humanBaseHp };
    this.aiBase = { id: 3, team: 'ai', x: FIELD.aiBaseX, hp: this.stage.aiBaseHp, maxHp: this.stage.aiBaseHp };
    this.spawnScheduled();
  }

  dispatch(command: BattleCommand): CommandResult {
    if (command.type === 'set-speed') {
      if (this.disposed || (this.status !== 'active' && this.status !== 'paused')) return { accepted: false, reason: '전투 중에만 배속을 바꿀 수 있어.' };
      if (command.speed !== 1 && command.speed !== 2 && command.speed !== 3) return { accepted: false, reason: '배속은 1배·2배·3배 중에서 골라줘.' };
      this.speed = command.speed;
      return { accepted: true, reason: `전투 ${this.speed}배속` };
    }
    if (this.disposed || this.status !== 'active') return { accepted: false, reason: '전투가 진행 중일 때 사용할 수 있어.' };
    if (command.type === 'move') { this.direction = command.direction; return { accepted: true }; }
    if (command.type === 'skill') return this.useSkill(command.skill);
    if (command.type === 'upgrade-economy') {
      const cost = ECONOMY[this.economyLevel].upgradeCost;
      if (cost === null) return { accepted: false, reason: '경제가 최대 레벨이야.' };
      if (this.gold < cost) return { accepted: false, reason: '투자할 자금이 부족해.' };
      this.gold -= cost;
      this.economyLevel++;
      return { accepted: true };
    }
    if (!this.unlockedAllies.includes(command.kind)) return { accepted: false, reason: '아직 해금하지 않은 동료야.' };
    if (!this.equippedAllies.includes(command.kind)) return { accepted: false, reason: '이번 출전 편성에 없는 동료야.' };
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
    let remaining = deltaSeconds * this.speed;
    if (!Number.isFinite(remaining)) return;
    while (remaining > 1e-8 && this.status === 'active') {
      const dt = Math.min(remaining, 1 / 60);
      this.tick(dt);
      remaining -= dt;
    }
  }

  snapshot(): BattleSnapshot {
    const economy = ECONOMY[this.economyLevel];
    return {
      runId: this.runId, stageId: this.stage.id, status: this.status, speed: this.speed, defeatReason: this.defeatReason,
      elapsed: this.elapsed, gold: this.gold, economyLevel: this.economyLevel + 1,
      income: economy.income, goldCap: economy.cap, upgradeCost: economy.upgradeCost,
      hero: { ...this.hero, buffs: { ...this.hero.buffs } }, humanBase: { ...this.humanBase }, aiBase: { ...this.aiBase },
      units: this.units.map((unit) => ({ ...unit, buffs: { ...unit.buffs } })), projectiles: this.projectiles.map((projectile) => ({ ...projectile })),
      summonCooldowns: { ...this.cooldowns }, skillCooldowns: { ...this.skillCooldowns },
      effects: this.effects.map((effect) => ({ ...effect })),
      bossTelegraphs: this.bossTelegraphs.map(({ damage: _damage, ...telegraph }) => ({ ...telegraph })), defeatedBossCount: this.defeatedBossCount,
      judgeAttacks: this.judgeAttacks.map(({ damage: _damage, ...attack }) => ({ ...attack })),
      waterChannels: this.waterChannels.map(({ damage: _damage, untilTick: _tick, ticksRemaining: _ticks, ...channel }) => ({ ...channel })),
      foreachFlights: this.foreachFlights.map(({ damage: _damage, ...flight }) => ({ ...flight })),
      levels: { ...this.levels }, equippedAllies: [...this.equippedAllies], unlockedAllies: [...this.unlockedAllies],
      unlockedSkills: [...this.unlockedSkills], equippedSkills: [...this.equippedSkills], overclockRemaining: this.overclockRemaining,
    };
  }

  dispose(): void { this.disposed = true; this.direction = 0; this.units = []; this.pushes.clear(); this.projectiles = []; this.effects = []; this.clearPending(); this.overclockRemaining = 0; }

  private tick(dt: number): void {
    this.elapsed += dt;
    this.gold = Math.min(ECONOMY[this.economyLevel].cap, this.gold + ECONOMY[this.economyLevel].income * dt);
    // Cooldowns store base work. Split the last buff frame so expiry never earns extra work.
    const cooldownWork = dt + Math.min(dt, this.overclockRemaining);
    this.overclockRemaining = Math.max(0, this.overclockRemaining - dt);
    if (this.overclockRemaining < 1e-8) this.overclockRemaining = 0;
    const drainCooldown = (remaining: number, work: number) => remaining - work < 1e-8 ? 0 : remaining - work;
    for (const kind of ALLY_KINDS) this.cooldowns[kind] = drainCooldown(this.cooldowns[kind], cooldownWork);
    for (const skill of Object.keys(SKILLS) as SkillKind[]) this.skillCooldowns[skill] = drainCooldown(this.skillCooldowns[skill], skill === 'overclock' ? dt : cooldownWork);
    this.effects = this.effects.filter((effect) => { effect.remaining -= dt; return effect.remaining > 0; });
    this.tickBuffs(this.hero, dt);
    this.hero.x = Math.max(FIELD.heroMinX, Math.min(FIELD.heroMaxX, this.hero.x + this.direction * HERO.speed * (this.hero.buffs.speed > 0 ? SUPPORT.speedMultiplier : 1) * dt));
    this.hero.hitFlash = Math.max(0, this.hero.hitFlash - dt);
    this.spawnScheduled();
    const hits: Array<{ target: Target; damage: number }> = [];
    const living = this.units.filter((unit) => unit.hp > 0);
    const pushedThisTick = new Set<number>();
    for (const unit of living) {
      const push = this.pushes.get(unit.id);
      if (!push) continue;
      pushedThisTick.add(unit.id);
      // Constant-speed displacement, then drop the push force at the destination.
      // Normal walking must not counteract it; attack and warning timers still run.
      unit.x = Math.min(push.destination, unit.x + push.speed * dt);
      if (push.destination - unit.x < 1e-8) {
        unit.x = push.destination;
        this.pushes.delete(unit.id);
      }
    }
    const judgeImpacts: PendingJudge[] = [];
    this.judgeAttacks = this.judgeAttacks.filter(attack => {
      const source = this.units.find(unit => unit.id === attack.sourceId && unit.hp > 0);
      const target = this.targetById(attack.targetId);
      if (!source || !target || target.hp <= 0) return false;
      attack.x = target.x;
      attack.remaining = Math.max(0, attack.remaining - dt);
      if (attack.remaining > 1e-8) return true;
      judgeImpacts.push(attack); return false;
    });
    const channelingThisTick = new Set(this.waterChannels.map(channel => channel.sourceId));
    const waterTicks: PendingWater[] = [];
    this.waterChannels = this.waterChannels.filter(channel => {
      const source = this.units.find(unit => unit.id === channel.sourceId && unit.hp > 0);
      if (!source) return false;
      channel.x = source.x; channel.endX = source.x + this.definitions[source.kind].range;
      channel.remaining = Math.max(0, channel.remaining - dt);
      channel.untilTick -= dt;
      while (channel.ticksRemaining > 0 && channel.untilTick <= 1e-8) {
        waterTicks.push({ ...channel }); channel.ticksRemaining--; channel.untilTick += WATER.tickInterval;
      }
      return channel.remaining > 1e-8;
    });
    const foreachImpacts: PendingForeach[] = [];
    this.foreachFlights = this.foreachFlights.filter(flight => {
      if (this.hero.hp <= 0) return false;
      flight.remaining = Math.max(0, flight.remaining - dt);
      if (flight.remaining > 1e-8) return true;
      foreachImpacts.push(flight); return false;
    });
    const detonations: PendingBoss[] = [];
    this.bossTelegraphs = this.bossTelegraphs.filter((telegraph) => {
      if (!living.some((unit) => unit.id === telegraph.ownerId)) return false;
      telegraph.remaining = Math.max(0, telegraph.remaining - dt);
      if (telegraph.remaining > 1e-8) return true;
      detonations.push(telegraph);
      return false;
    });
    // Collect all same-step damage before applying it; defeat takes priority over a simultaneous win.
    this.projectiles = this.projectiles.filter((projectile) => {
      const travel = Math.min(projectile.remainingRange, projectile.speed * dt);
      const nextX = projectile.x + projectile.direction * travel;
      const target = getProjectileTarget(this.targets(projectile.team), projectile, travel);
      if (target) {
        hits.push({ target, damage: projectile.damage });
        if (projectile.source === 'hero') this.effect('hello-impact', target.x, 36);
        return false;
      }
      projectile.x = nextX;
      projectile.remainingRange -= travel;
      return projectile.remainingRange > 0 && nextX >= 0 && nextX <= FIELD.width;
    });
    for (const unit of living) {
      const definition = this.definitions[unit.kind];
      const attackWork = dt + Math.min(dt, unit.buffs.haste) * (SUPPORT.hasteMultiplier - 1);
      this.tickBuffs(unit, dt);
      unit.slowRemaining = Math.max(0, unit.slowRemaining - dt);
      unit.weakenRemaining = Math.max(0, unit.weakenRemaining - dt);
      if (unit.kind === 'support' || unit.kind === 'counselor' || unit.kind === 'singer') {
        unit.supportCooldown -= dt;
        if (unit.supportCooldown <= 1e-8) { unit.supportCooldown += unit.kind === 'singer' ? SONG.period : SUPPORT.period; this.support(unit); }
      }
      unit.attackCooldown = Math.max(0, unit.attackCooldown - attackWork);
      unit.hitFlash = Math.max(0, unit.hitFlash - dt);
      unit.attackFlash = Math.max(0, unit.attackFlash - dt);
      if (channelingThisTick.has(unit.id)) continue;
      const target = this.nearestTarget(unit);
      if (unit.kind === 'gpt-4o') {
        unit.bossCooldown = Math.max(0, unit.bossCooldown - dt);
        // The locked warning area stays put even when its target moves or changes.
        if (this.bossTelegraphs.some((telegraph) => telegraph.ownerId === unit.id) || detonations.some((telegraph) => telegraph.ownerId === unit.id)) continue;
        if (unit.bossCooldown <= 1e-8) {
          unit.bossCooldown = BOSS.cooldown;
          this.bossTelegraphs.push({ ownerId: unit.id, x: unit.x + (target.x >= unit.x ? 1 : -1) * BOSS.forwardOffset,
            radius: BOSS.radius, remaining: BOSS.windup, duration: BOSS.windup, damage: this.attackDamage(unit, BOSS.damage) });
          continue;
        }
      }
      const gap = Math.abs(target.x - unit.x);
      if (gap <= definition.range) {
        if (definition.damage > 0 && unit.attackCooldown <= 0) {
          unit.attackCooldown = definition.attackInterval;
          unit.attackFlash = 0.18;
          const damage = this.attackDamage(unit, definition.damage);
          if (unit.kind === 'judge') {
            this.judgeAttacks.push({ id: this.nextId++, sourceId: unit.id, targetId: target.id, x: target.x,
              remaining: JUDGE.windup + JUDGE.fall, duration: JUDGE.windup + JUDGE.fall, windup: JUDGE.windup, damage });
          } else if (unit.kind === 'firefighter') {
            this.waterChannels.push({ id: this.nextId++, sourceId: unit.id, x: unit.x, endX: unit.x + definition.range,
              remaining: WATER.duration, duration: WATER.duration, untilTick: WATER.tickInterval, ticksRemaining: WATER.ticks, damage: damage / WATER.ticks });
          } else if (definition.projectileSpeed) {
            this.projectiles.push({ id: this.nextId++, source: unit.kind, team: unit.team, x: unit.x,
              direction: target.x >= unit.x ? 1 : -1, speed: definition.projectileSpeed,
              damage, remainingRange: definition.range + 20 });
          } else hits.push({ target, damage });
        }
      } else if (!pushedThisTick.has(unit.id)) {
        const direction = target.x >= unit.x ? 1 : -1;
        unit.x += direction * Math.min(definition.speed * (unit.slowRemaining > 0 ? SKILLS.sleep.speedMultiplier : 1) * (unit.buffs.speed > 0 ? SUPPORT.speedMultiplier : 1) * dt, gap - definition.range);
      }
    }
    // Impact ties resolve ordinary attacks → judge → water → foreach → boss.
    // Each delayed impact checks its living owner again, so earlier lethal hits cancel it.
    for (const hit of hits) this.hit(hit.target, hit.damage);
    for (const attack of judgeImpacts) {
      const source = this.units.find(unit => unit.id === attack.sourceId && unit.hp > 0);
      const target = this.targetById(attack.targetId);
      if (!source || !target || target.hp <= 0) continue;
      this.hit(target, attack.damage);
      this.effect('judge-impact', target.x, 34);
    }
    for (const channel of waterTicks) {
      if (!this.units.some(unit => unit.id === channel.sourceId && unit.hp > 0)) continue;
      for (const target of this.targets('human').filter(target => target.hp > 0 && target.x >= channel.x && target.x <= channel.endX)) this.hit(target, channel.damage);
    }
    for (const flight of foreachImpacts) {
      if (this.hero.hp <= 0) continue;
      for (const unit of this.units.filter(unit => unit.team === 'ai' && unit.hp > 0 && Math.abs(unit.x - flight.x) <= flight.radius)) this.hit(unit, flight.damage);
      this.effect('foreach-impact', flight.x, flight.radius);
    }
    // An owner killed on the final warning frame cannot leave a posthumous blast.
    for (const telegraph of detonations) {
      if (!this.units.some((unit) => unit.id === telegraph.ownerId && unit.hp > 0)) continue;
      this.effect('boss-blast', telegraph.x, telegraph.radius);
      for (const target of this.targets('ai').filter((candidate) => candidate.hp > 0 && Math.abs(candidate.x - telegraph.x) <= telegraph.radius)) {
        this.hit(target, telegraph.damage);
      }
    }
    this.defeatedBossCount += this.units.filter((unit) => unit.kind === 'gpt-4o' && unit.hp <= 0).length;
    this.units = this.units.filter((unit) => unit.hp > 0);
    for (const id of this.pushes.keys()) if (!this.units.some(unit => unit.id === id)) this.pushes.delete(id);
    this.bossTelegraphs = this.bossTelegraphs.filter((telegraph) => this.units.some((unit) => unit.id === telegraph.ownerId));
    this.judgeAttacks = this.judgeAttacks.filter(attack => {
      const target = this.targetById(attack.targetId);
      if (!this.units.some(unit => unit.id === attack.sourceId) || !target || target.hp <= 0) return false;
      attack.x = target.x; return true;
    });
    this.waterChannels = this.waterChannels.filter(channel => this.units.some(unit => unit.id === channel.sourceId));
    if (this.hero.hp <= 0 || this.humanBase.hp <= 0) {
      this.status = 'lost';
      this.defeatReason = this.hero.hp <= 0 ? 'hero' : 'base';
      this.direction = 0;
    } else if (this.aiBase.hp <= 0) { this.status = 'won'; this.direction = 0; }
    if (this.status !== 'active') { this.clearPending(); this.overclockRemaining = 0; this.pushes.clear(); }
  }

  private useSkill(skill: SkillKind): CommandResult {
    if (!Object.prototype.hasOwnProperty.call(SKILLS, skill)) return { accepted: false, reason: '알 수 없는 스킬이야.' };
    const definition = SKILLS[skill];
    if (!this.unlockedSkills.includes(skill)) return { accepted: false, reason: `${definition.label}은 상점에서 해금해야 해.` };
    if (!this.equippedSkills.includes(skill)) return { accepted: false, reason: `${definition.label}은 이번 스킬 편성에 없어.` };
    if (this.skillCooldowns[skill] > 0) return { accepted: false, reason: `${definition.label} 준비 중이야.` };
    if (this.gold < definition.cost) return { accepted: false, reason: `${definition.label}에 쓸 자금이 부족해.` };
    this.gold -= definition.cost;
    this.skillCooldowns[skill] = definition.cooldown;
    const values = getSkillValues(this.hero);
    if (skill === 'hello-world') {
      this.projectiles.push({ id: this.nextId++, source: 'hero', team: 'human', x: this.hero.x,
        direction: 1, speed: SKILLS['hello-world'].speed,
        damage: values.helloDamage, remainingRange: values.helloRange });
    } else if (skill === 'sleep') {
      for (const unit of this.units) {
        if (unit.team === 'ai' && Math.abs(unit.x - this.hero.x) <= values.sleepRadius) unit.slowRemaining = values.sleepDuration;
      }
      this.effect('sleep', this.hero.x, SKILLS.sleep.radius);
    } else if (skill === 'heal') {
      this.heal(this.nearbyAllies(this.hero.x, values.healRadius), values.healAmount);
      this.effect('heal', this.hero.x, SKILLS.heal.radius);
    } else if (skill === 'git-push') {
      for (const unit of this.units) {
        if (unit.team === 'ai' && unit.hp > 0 && Math.abs(unit.x - this.hero.x) <= values.pushRadius) {
          const destination = getPushDestination(unit, this.aiBase.x);
          if (destination > unit.x) this.pushes.set(unit.id, { destination, speed: (destination - unit.x) / SKILLS['git-push'].pushDuration });
        }
      }
      this.effect('git-push', this.hero.x, values.pushRadius);
    } else if (skill === 'foreach') {
      this.foreachFlights.push({ id: this.nextId++, sourceId: this.hero.id, startX: this.hero.x, x: this.hero.x + values.foreachOffset,
        radius: values.foreachRadius, remaining: values.foreachFlight, duration: values.foreachFlight, damage: values.foreachDamage });
    } else {
      this.overclockRemaining = values.overclockDuration;
      this.effect('overclock', this.hero.x, 0);
    }
    return { accepted: true, reason: `${definition.label} 발동!` };
  }

  private nearbyAllies(x: number, radius: number): Array<HeroState | UnitState> {
    return [this.hero, ...this.units.filter((unit) => unit.team === 'human')]
      .filter((unit) => unit.hp > 0 && Math.abs(unit.x - x) <= radius);
  }

  private heal(targets: Array<HeroState | UnitState>, amount: number): void {
    for (const target of targets) { target.hp = Math.min(target.maxHp, target.hp + amount); target.healFlash = 0.5; }
  }

  private support(unit: UnitState): void {
    const targets = this.nearbyAllies(unit.x, unit.kind === 'singer' ? SONG.radius : SUPPORT.radius);
    if (unit.kind === 'counselor') {
      this.heal(targets, SUPPORT.heal * this.levelMultiplier(unit.level));
      this.effect('support-heal', unit.x, SUPPORT.radius);
    } else if (unit.kind === 'singer') {
      for (const target of targets) target.buffs.combat = SONG.duration;
      for (const enemy of this.units.filter(target => target.team === 'ai' && target.hp > 0 && Math.abs(target.x - unit.x) <= SONG.radius)) enemy.weakenRemaining = SONG.duration;
      this.effect('support-song', unit.x, SONG.radius);
    } else {
      for (const target of targets) {
        if ('kind' in target && this.definitions[target.kind].damage > 0) target.buffs.haste = SUPPORT.duration;
      }
      this.effect('support-haste', unit.x, SUPPORT.radius);
    }
    unit.attackFlash = 0.3;
  }

  private tickBuffs(target: HeroState | UnitState, dt: number): void {
    target.buffs.haste = Math.max(0, target.buffs.haste - dt);
    target.buffs.combat = Math.max(0, target.buffs.combat - dt);
    target.buffs.speed = Math.max(0, target.buffs.speed - dt);
    target.healFlash = Math.max(0, target.healFlash - dt);
  }

  private effect(kind: EffectKind, x: number, radius: number): void {
    this.effects.push({ id: this.nextId++, kind, x, radius, remaining: 0.65, duration: 0.65 });
  }

  private attackDamage(unit: UnitState, baseDamage: number): number {
    return baseDamage * this.levelMultiplier(unit.level) * (unit.buffs.combat > 0 ? SUPPORT.damageMultiplier : 1) * (unit.weakenRemaining > 0 ? SONG.enemyDamageMultiplier : 1);
  }

  private hit(target: Target, damage: number): void {
    target.hp = Math.max(0, target.hp - damage * ('buffs' in target && target.buffs.combat > 0 ? SUPPORT.receivedDamageMultiplier : 1));
    if ('hitFlash' in target) target.hitFlash = .18;
  }

  private targetById(id: number): Target | undefined {
    return id === this.hero.id ? this.hero : id === this.aiBase.id ? this.aiBase : id === this.humanBase.id ? this.humanBase : this.units.find(unit => unit.id === id);
  }

  private clearPending(): void { this.bossTelegraphs = []; this.judgeAttacks = []; this.waterChannels = []; this.foreachFlights = []; }

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
      bodyWidth: definition.bodyWidth,
      hp, maxHp: hp, attackCooldown: 0, hitFlash: 0, attackFlash: 0,
      slowRemaining: 0, weakenRemaining: 0, supportCooldown: kind === 'singer' ? SONG.period : SUPPORT.period, bossCooldown: kind === 'gpt-4o' ? BOSS.firstCastDelay : 0,
      healFlash: 0, buffs: { combat: 0, speed: 0, haste: 0 } });
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

  private levelMultiplier(level: number): number { return levelMultiplier(level); }
}
