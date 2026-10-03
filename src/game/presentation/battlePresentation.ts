import { FIELD, SKILLS, UNIT_DEFINITIONS } from '../battle/balance';
import { getProjectileTarget, getPushDestination } from '../BattleSession';
import type { BattleSnapshot, SkillKind } from '../battle/types';
import { getStage, isBossStage } from '../progression/stages';

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
  if (skill === 'foreach') {
    const x = snapshot.hero.x + SKILLS.foreach.forwardOffset;
    return { shape: 'area' as const, skill, x, radius: SKILLS.foreach.radius,
      targetIds: snapshot.units.filter(unit => unit.team === 'ai' && unit.hp > 0 && Math.abs(unit.x - x) <= SKILLS.foreach.radius).map(unit => unit.id), destinations: [] };
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

/** A fallen hero does not destroy either base; each texture follows its own HP. */
export function getBaseArt(snapshot: Pick<BattleSnapshot, 'stageId' | 'humanBase' | 'aiBase'>) {
  const enemy = getEnemyBaseKey(snapshot.stageId) ?? 'enemy-base';
  return { human: snapshot.humanBase.hp <= 0 ? 'human-base-destroyed' : 'human-base',
    enemy: snapshot.aiBase.hp <= 0 ? `${enemy}-destroyed` : enemy };
}

/** Unknown simulation stages keep the procedural fallback; every catalog stage uses source art. */
export function getEnemyBaseKey(stageId?: string): 'enemy-base' | 'enemy-base-3' | 'enemy-base-chapter-2' | 'enemy-base-chapter-2-boss' | null {
  if (!stageId || !getStage(stageId)) return null;
  if (stageId === '2-5') return 'enemy-base-chapter-2-boss';
  if (['2-1', '2-2', '2-3', '2-4'].includes(stageId)) return 'enemy-base-chapter-2';
  return isBossStage(stageId) ? 'enemy-base-3' : 'enemy-base';
}

/** Aggregate living bosses, and describe the active owner whose warning is nearest the hero. */
export function getBossHud(snapshot: Pick<BattleSnapshot, 'units' | 'bossTelegraphs' | 'hero'>) {
  const bosses = snapshot.units.filter(unit => unit.kind === 'gpt-4o' && unit.hp > 0);
  if (!bosses.length) return null;
  const ownerIds = new Set(bosses.map(unit => unit.id));
  const warnings = snapshot.bossTelegraphs.filter(warning => ownerIds.has(warning.ownerId));
  const nearest = [...warnings].sort((a, b) => Math.abs(a.x - snapshot.hero.x) - Math.abs(b.x - snapshot.hero.x) || a.remaining - b.remaining || a.ownerId - b.ownerId)[0];
  const hp = bosses.reduce((total, unit) => total + unit.hp, 0);
  const maxHp = bosses.reduce((total, unit) => total + unit.maxHp, 0);
  const cooldown = Math.min(...bosses.map(unit => unit.bossCooldown));
  return { count: bosses.length, label: bosses.length > 1 ? `GPT-4o ×${bosses.length}` : 'GPT-4o',
    hp: Math.ceil(hp), maxHp, percent: Math.round(hp / maxHp * 100), progress: hp / maxHp,
    castCount: warnings.length, attackOwnerId: nearest?.ownerId,
    attack: nearest ? warnings.length > 1 ? `범위 공격 ${warnings.length}개 · 가까운 공격 ${nearest.remaining.toFixed(1)}초` : `전방 범위 공격 ${nearest.remaining.toFixed(1)}초` : `범위 공격 준비 ${cooldown.toFixed(1)}초` };
}
