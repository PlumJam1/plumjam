export type Team = 'human' | 'ai';
export type AllyKind = 'melee' | 'ranged' | 'support' | 'technician' | 'judge' | 'counselor' | 'athlete' | 'firefighter' | 'singer';
export type EnemyKind = 'robot-melee' | 'robot-ranged' | 'robot-runner' | 'robot-heavy' | 'gpt-4o';
export type UnitKind = AllyKind | EnemyKind;
export type SkillKind = 'hello-world' | 'sleep' | 'heal' | 'git-push' | 'overclock' | 'foreach';
export type CharacterKind = 'hero' | AllyKind;
export type BattleStatus = 'active' | 'paused' | 'won' | 'lost';
export type BattleSpeed = 1 | 2 | 3;
export type DefeatReason = 'hero' | 'base';

export interface UnitDefinition {
  label: string;
  team: Team;
  /** Logical displayed body width; knockback uses this same width. */
  bodyWidth: number;
  hp: number;
  damage: number;
  speed: number;
  range: number;
  attackInterval: number;
  projectileSpeed?: number;
  cost?: number;
  summonCooldown?: number;
}
export interface EconomyDefinition { income: number; cap: number; upgradeCost: number | null }
export interface SpawnEvent { at: number; kind: EnemyKind }
export interface StageDefinition {
  id: string;
  label: string;
  humanBaseHp: number;
  aiBaseHp: number;
  initialGold: number;
  clearReward?: number;
  theme?: 'early' | 'mid' | 'boss';
  spawns: readonly SpawnEvent[];
  /** Fixed simulation-time warning windows, announced before authored rushes. */
  waveNotices?: readonly { at: number; label: string; duration: number }[];
  /** Optional repeating pressure after authored introductory waves. */
  repeat?: { startAt: number; interval: number; kinds: readonly EnemyKind[] };
}
export interface TimedBuffs {
  /** Remaining seconds. A repeated effect refreshes this timer without stacking magnitude. */
  combat: number;
  speed: number;
  haste: number;
}
export type EffectKind = SkillKind | 'hello-impact' | 'foreach-impact' | 'judge-impact' | 'support-heal' | 'support-combat' | 'support-speed' | 'support-haste' | 'support-song' | 'boss-blast';
export interface EffectState { id: number; kind: EffectKind; x: number; radius: number; remaining: number; duration: number }
export interface BossTelegraphState { ownerId: number; x: number; radius: number; remaining: number; duration: number }
export interface JudgeAttackState { id: number; sourceId: number; targetId: number; x: number; remaining: number; duration: number; windup: number }
export interface WaterChannelState { id: number; sourceId: number; x: number; endX: number; remaining: number; duration: number }
export interface ForeachFlightState { id: number; sourceId: number; startX: number; x: number; radius: number; remaining: number; duration: number }
export interface UnitState {
  id: number;
  kind: UnitKind;
  team: Team;
  x: number;
  bodyWidth: number;
  hp: number;
  maxHp: number;
  level: number;
  attackCooldown: number;
  /** Visual feedback timer independent of the attack cooldown. */
  hitFlash: number;
  attackFlash: number;
  slowRemaining: number;
  /** Singer's outgoing attack multiplier; refreshes without stacking. */
  weakenRemaining: number;
  supportCooldown: number;
  bossCooldown: number;
  buffs: TimedBuffs;
  healFlash: number;
}
export interface HeroState { id: number; x: number; hp: number; maxHp: number; level: number; hitFlash: number; healFlash: number; buffs: TimedBuffs }
export interface BaseState { id: number; team: Team; x: number; hp: number; maxHp: number }
export interface ProjectileState {
  id: number;
  team: Team;
  x: number;
  direction: -1 | 1;
  damage: number;
  speed: number;
  remainingRange: number;
  source: UnitKind | 'hero';
}
export type BattleCommand =
  | { type: 'set-speed'; speed: BattleSpeed }
  | { type: 'move'; direction: -1 | 0 | 1 }
  | { type: 'summon'; kind: AllyKind }
  | { type: 'upgrade-economy' }
  | { type: 'skill'; skill: SkillKind };
export interface CommandResult { accepted: boolean; reason?: string }
export interface BattleSnapshot {
  runId: number;
  stageId: string;
  status: BattleStatus;
  speed: BattleSpeed;
  defeatReason?: DefeatReason;
  elapsed: number;
  gold: number;
  economyLevel: number;
  income: number;
  goldCap: number;
  upgradeCost: number | null;
  hero: Readonly<HeroState>;
  humanBase: Readonly<BaseState>;
  aiBase: Readonly<BaseState>;
  units: readonly Readonly<UnitState>[];
  projectiles: readonly Readonly<ProjectileState>[];
  summonCooldowns: Readonly<Record<AllyKind, number>>;
  skillCooldowns: Readonly<Record<SkillKind, number>>;
  effects: readonly Readonly<EffectState>[];
  judgeAttacks: readonly Readonly<JudgeAttackState>[];
  waterChannels: readonly Readonly<WaterChannelState>[];
  foreachFlights: readonly Readonly<ForeachFlightState>[];
  bossTelegraphs: readonly Readonly<BossTelegraphState>[];
  defeatedBossCount: number;
  unlockedSkills: readonly SkillKind[];
  equippedSkills: readonly SkillKind[];
  levels: Readonly<Record<CharacterKind, number>>;
  equippedAllies: readonly (AllyKind | null)[];
  unlockedAllies: readonly AllyKind[];
  overclockRemaining: number;
}
