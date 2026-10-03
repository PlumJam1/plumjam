import { SKILLS } from '../battle/balance';
import { getPushDestination } from '../BattleSession';
import type { BattleSnapshot, SkillKind } from '../battle/types';

/** A preview uses the same lane distance and team eligibility as the session's area casts. */
export function skillPreview(snapshot: BattleSnapshot, skill: SkillKind | null) {
  if (snapshot.status !== 'active' || (skill !== 'sleep' && skill !== 'heal' && skill !== 'git-push')) return null;
  const radius = SKILLS[skill].radius;
  const team = skill === 'heal' ? 'human' : 'ai';
  const targets = snapshot.units.filter(unit => unit.hp > 0 && unit.team === team && Math.abs(unit.x - snapshot.hero.x) <= radius);
  const targetIds = targets.map(unit => unit.id);
  if (skill === 'heal' && snapshot.hero.hp > 0) targetIds.push(snapshot.hero.id);
  const destinations = skill === 'git-push' ? targets.map(unit => ({ id: unit.id, from: unit.x, x: getPushDestination(unit, snapshot.aiBase.x), bodyWidth: unit.bodyWidth })) : [];
  return { skill, x: snapshot.hero.x, radius, targetIds, destinations };
}
