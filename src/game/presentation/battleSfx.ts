import type { BattleSnapshot, ProjectileState, UnitKind } from '../battle/types';
import type { SfxKey } from './sfx';

/** Synchronous attacks (no travel time): the attacker's own cue plays at the swing. */
const ACTION_SOUND: Partial<Record<UnitKind, SfxKey>> = {
  melee: 'punch-02', 'robot-melee': 'punch-02',
  technician: 'punch', athlete: 'punch', 'robot-heavy': 'punch',
  firefighter: 'industrial-pump',
};
const SUPPORT_KINDS: ReadonlySet<UnitKind> = new Set(['support', 'counselor', 'singer']);
/** Travel-time attacks: the launch cue fires on spawn, the hit cue on the projectile's own disappearance. */
const PROJECTILE_LAUNCH: Partial<Record<ProjectileState['source'], SfxKey>> = { ranged: 'whoosh', 'robot-ranged': 'whoosh' };
const PROJECTILE_HIT: Partial<Record<ProjectileState['source'], SfxKey>> = { ranged: 'punch-02', 'robot-ranged': 'punch-02', 'gpt-4o': 'explosive-punch', hero: 'punch' };

/**
 * Diffs two consecutive snapshots into the one-shot cues that should play for this tick.
 * A disappeared projectile is treated as a hit; an in-range miss is the rare false positive.
 */
export function battleSfxCues(previous: BattleSnapshot | undefined, current: BattleSnapshot): SfxKey[] {
  if (!previous || previous.runId !== current.runId) return [];
  const cues: SfxKey[] = [];
  const priorUnits = new Map(previous.units.map(unit => [unit.id, unit]));
  for (const unit of current.units) {
    const before = priorUnits.get(unit.id);
    if (unit.attackFlash <= 0 || (before && before.attackFlash > 0)) continue;
    if (SUPPORT_KINDS.has(unit.kind)) cues.push('magic');
    else { const sound = ACTION_SOUND[unit.kind]; if (sound) cues.push(sound); }
  }
  const priorEffectIds = new Set(previous.effects.map(effect => effect.id));
  for (const effect of current.effects) {
    if (priorEffectIds.has(effect.id)) continue;
    if (effect.kind === 'judge-impact' || effect.kind === 'boss-blast') cues.push('explosive-punch');
  }
  const priorProjectileIds = new Set(previous.projectiles.map(projectile => projectile.id));
  const currentProjectileIds = new Set<number>();
  for (const projectile of current.projectiles) {
    currentProjectileIds.add(projectile.id);
    if (priorProjectileIds.has(projectile.id)) continue;
    const launch = PROJECTILE_LAUNCH[projectile.source];
    if (launch) cues.push(launch);
  }
  for (const projectile of previous.projectiles) {
    if (currentProjectileIds.has(projectile.id)) continue;
    const hit = PROJECTILE_HIT[projectile.source];
    if (hit) cues.push(hit);
  }
  return cues;
}
