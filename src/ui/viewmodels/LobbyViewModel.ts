import { assetUrl, characterArt } from '../../game/presentation/assets';
import { computed, effectScope, readonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneScope } from '../../core/SceneLifetimeManager';
import { CHARACTERS, levelMultiplier, MAX_LEVEL, upgradeCost } from '../../game/progression/ProfileService';
import { STAGES } from '../../game/progression/stages';
import { HERO, SKILLS, SKILL_UNLOCK_COSTS, SUPPORT, UNIT_DEFINITIONS } from '../../game/battle/balance';
import type { CharacterKind, SkillKind } from '../../game/battle/types';
const growth = { hero: '맥북과 능숙해진 개발자', melee: '녹초가 된 좀비 회사원', ranged: '배가 나오고 머리가 빠진 회사원', support: '빨간 안경의 서비스직' };
export function createLobbyViewModel(context: AppContext, scope: SceneScope, initialTab: 'menu' | 'stages' | 'training' | 'shop') {
  const effects = effectScope(true);
  const profile = shallowRef(context.profile.snapshot());
  const tab = shallowRef(initialTab);
  const upgradeFeedback = shallowRef('');
  const selectedStageId = shallowRef('1-1');
  scope.defer(context.profile.subscribe(value => { if (!scope.disposed) profile.value = value; }));
  const model = effects.run(() => ({
    profile: readonly(profile), lobbyTab: readonly(tab), upgradeFeedback: readonly(upgradeFeedback),
    selectedStageId: readonly(selectedStageId),
    selectedStage: computed(() => { const stage = STAGES.find(item => item.id === selectedStageId.value)!; return { ...stage, locked: !profile.value.unlockedStages.includes(stage.id), enemies: [...new Set(stage.spawns.map(spawn => UNIT_DEFINITIONS[spawn.kind].label))].join(' · ') }; }),
    selectStage: (id: string) => { if (!scope.disposed && STAGES.some(stage => stage.id === id)) selectedStageId.value = id; },
    stages: computed(() => STAGES.map(stage => ({ ...stage, locked: !profile.value.unlockedStages.includes(stage.id), cleared: profile.value.clearedStages.includes(stage.id) }))),
    shopSkills: computed(() => (Object.keys(SKILL_UNLOCK_COSTS) as Array<keyof typeof SKILL_UNLOCK_COSTS>).map(kind => {
      const cost = SKILL_UNLOCK_COSTS[kind];
      const unlocked = profile.value.unlockedSkills.includes(kind);
      return { kind, label: SKILLS[kind].label, description: SKILLS[kind].description, cost, unlocked,
        disabled: unlocked || profile.value.xp < cost,
        reason: unlocked ? '해금 완료' : profile.value.xp < cost ? `재화 ${cost - profile.value.xp} 부족` : `${cost} XP 해금`,
      };
    })),
    characters: computed(() => CHARACTERS.map(kind => {
      const level = profile.value.levels[kind];
      const multiplier = levelMultiplier(level);
      const nextMultiplier = levelMultiplier(Math.min(MAX_LEVEL, level + 1));
      const hp = kind === 'hero' ? HERO.hp : UNIT_DEFINITIONS[kind].hp;
      const damage = kind === 'hero' ? SKILLS['hello-world'].damage : kind === 'support' ? SUPPORT.heal : UNIT_DEFINITIONS[kind].damage;
      const cost = upgradeCost(level);
      return { kind, label: kind === 'hero' ? '주인공 개발자' : UNIT_DEFINITIONS[kind].label, level, cost,
        evolved: level >= 5, growth: growth[kind], image: assetUrl(characterArt(kind, level)), preview: assetUrl(characterArt(kind, 5)),
        hp: Math.round(hp * multiplier), nextHp: Math.round(hp * nextMultiplier),
        statLabel: kind === 'support' ? '회복' : kind === 'hero' ? '스킬 피해' : '공격', stat: Math.round(damage * multiplier), nextStat: Math.round(damage * nextMultiplier),
        disabled: cost === null || profile.value.xp < cost,
        reason: cost === null ? '최대 레벨' : profile.value.xp < cost ? `재화 ${cost - profile.value.xp} 부족` : `${cost} XP 강화`,
      };
    })),
    setLobbyTab: (value: 'menu' | 'stages' | 'training' | 'shop') => { if (!scope.disposed) tab.value = value; },
    upgradeCharacter: (kind: CharacterKind) => {
      if (!scope.disposed && context.bridge.sceneState?.scene === 'Lobby' && context.bridge.sceneState.runId === scope.id) upgradeFeedback.value = context.profile.upgrade(kind).reason ?? '';
    },
    purchaseSkill: (kind: SkillKind) => {
      if (!scope.disposed && context.bridge.sceneState?.scene === 'Lobby' && context.bridge.sceneState.runId === scope.id) upgradeFeedback.value = context.profile.purchaseSkill(kind).reason ?? '';
    },
    toggleMuted: () => { if (!scope.disposed) context.profile.setMuted(!profile.value.muted); },
  }))!;
  scope.defer(() => effects.stop());
  return model;
}
