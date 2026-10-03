export type Team = 'human' | 'ai';
export type AllyKind = 'melee' | 'ranged' | 'support';
export type EnemyKind = 'robot-melee' | 'robot-ranged' | 'gpt-4o';
export type UnitKind = AllyKind | EnemyKind;
export type SkillKind = 'hello-world' | 'sleep' | 'heal';
export type CharacterKind = 'hero' | AllyKind;
export type BattleStatus = 'active' | 'paused' | 'won' | 'lost';
export type DefeatReason = 'hero' | 'base';

export interface UnitDefinition {
  label: string;
  team: Team;
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
  spawns: readonly SpawnEvent[];
  /** Optional repeating pressure after authored introductory waves. */
  repeat?: { startAt: number; interval: number; kinds: readonly EnemyKind[] };
}
export interface UnitState {
  id: number;
  kind: UnitKind;
  team: Team;
  x: number;
  hp: number;
  maxHp: number;
  level: number;
  attackCooldown: number;
  /** Visual feedback timer independent of the attack cooldown. */
  hitFlash: number;
  attackFlash: number;
}
export interface HeroState { id: number; x: number; hp: number; maxHp: number; level: number; hitFlash: number }
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
  | { type: 'move'; direction: -1 | 0 | 1 }
  | { type: 'summon'; kind: AllyKind }
  | { type: 'upgrade-economy' }
  | { type: 'skill'; skill: SkillKind };
export interface CommandResult { accepted: boolean; reason?: string }
export interface BattleSnapshot {
  runId: number;
  stageId: string;
  status: BattleStatus;
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
}
