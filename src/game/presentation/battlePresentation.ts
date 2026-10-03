import { FIELD, SKILLS, UNIT_DEFINITIONS } from '../battle/balance';
import { getProjectileTarget, getPushDestination } from '../BattleSession';
import type { BattleSnapshot, SkillKind } from '../battle/types';

/** Current positions only: moving targets can change a projectile's eventual hit. */
export function skillPreview(snapshot: BattleSnapshot, skill: SkillKind | null) {
  if (snapshot.status !== 'active' || !skill || !snapshot.equippedSkills.includes(skill)) return null;
  if (skill === 'hello-world') {
    const candidates = [...snapshot.units.filter(unit => unit.hp > 0 && unit.team === 'ai'), ...(snapshot.aiBase.hp > 0 ? [snapshot.aiBase] : [])];
    const target = getProjectileTarget(candidates, { x: snapshot.hero.x, direction: 1, source: 'hero' }, SKILLS[skill].range);
    const unit = snapshot.units.find(unit => unit.id === target?.id);
    return { shape: 'line' as const, skill, x: snapshot.hero.x, radius: 0,
      endX: Math.min(FIELD.width, snapshot.hero.x + SKILLS[skill].range + 5),
      targetIds: target ? [target.id] : [], destinations: [],
      targetLabel: unit ? UNIT_DEFINITIONS[unit.kind].label : target ? '적 기지' : '없음' };
  }
  if (skill !== 'sleep' && skill !== 'heal' && skill !== 'git-push') return null;
  const radius = SKILLS[skill].radius;
  const team = skill === 'heal' ? 'human' : 'ai';
  const targets = snapshot.units.filter(unit => unit.hp > 0 && unit.team === team && Math.abs(unit.x - snapshot.hero.x) <= radius);
  const targetIds = targets.map(unit => unit.id);
  if (skill === 'heal' && snapshot.hero.hp > 0) targetIds.push(snapshot.hero.id);
  const destinations = skill === 'git-push' ? targets.map(unit => ({ id: unit.id, from: unit.x, x: getPushDestination(unit, snapshot.aiBase.x), bodyWidth: unit.bodyWidth })) : [];
  return { shape: 'area' as const, skill, x: snapshot.hero.x, radius, targetIds, destinations };
}
