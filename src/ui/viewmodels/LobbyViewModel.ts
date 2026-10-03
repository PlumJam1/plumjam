import { assetUrl, characterArt } from '../../game/presentation/assets';
import { computed, effectScope, readonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneScope } from '../../core/SceneLifetimeManager';
import { CHARACTERS, levelMultiplier, MAX_LEVEL, upgradeCost } from '../../game/progression/ProfileService';
import { STAGES } from '../../game/progression/stages';
import { ALLY_KINDS, ALLY_ROLES, ALLY_UNLOCK_STAGES, FORMATION_SIZE, HERO, SKILLS, SKILL_UNLOCK_COSTS, SKILL_SLOT_COUNT, SUPPORT, UNIT_DEFINITIONS } from '../../game/battle/balance';
import type { AllyKind, CharacterKind, SkillKind } from '../../game/battle/types';
const growth = { hero: '맥북과 능숙해진 개발자', ...Object.fromEntries(ALLY_KINDS.map(kind => [kind, ALLY_ROLES[kind].evolution])) } as Record<CharacterKind, string>;
export function createLobbyViewModel(context: AppContext, scope: SceneScope, initialTab: 'menu' | 'stages' | 'training' | 'shop' | 'formation') {
  const effects = effectScope(true);
  const profile = shallowRef(context.profile.snapshot());
  const tab = shallowRef(initialTab);
  const upgradeFeedback = shallowRef('');
  const selectedSlot = shallowRef(0);
  const selectedSkillSlot = shallowRef(0);
  const selectedAllyKind = shallowRef<AllyKind>(ALLY_KINDS[0]);
  const selectedCharacterKind = shallowRef<CharacterKind>('hero');
  const shiftSelection = <T extends string>(values: readonly T[], current: T, offset: number): T => values[(values.indexOf(current) + offset % values.length + values.length) % values.length];
  const currentLobby = () => !scope.disposed && context.bridge.sceneState?.scene === 'Lobby' && context.bridge.sceneState.runId === scope.id;
  const selectedStageId = shallowRef('1-1');
  scope.defer(context.profile.subscribe(value => { if (!scope.disposed) profile.value = value; }));
  const model = effects.run(() => ({
    profile: readonly(profile), lobbyTab: readonly(tab), upgradeFeedback: readonly(upgradeFeedback),
    selectedStageId: readonly(selectedStageId), selectedSlot: readonly(selectedSlot), selectedSkillSlot: readonly(selectedSkillSlot),
    selectedAllyKind: readonly(selectedAllyKind), selectedCharacterKind: readonly(selectedCharacterKind),
    selectAlly: (kind: AllyKind) => { if (currentLobby() && ALLY_KINDS.includes(kind)) selectedAllyKind.value = kind; },
    shiftAlly: (offset: number) => { if (currentLobby() && Number.isInteger(offset)) selectedAllyKind.value = shiftSelection(ALLY_KINDS, selectedAllyKind.value, offset); },
    selectCharacter: (kind: CharacterKind) => { if (currentLobby() && CHARACTERS.includes(kind)) selectedCharacterKind.value = kind; },
    shiftCharacter: (offset: number) => { if (currentLobby() && Number.isInteger(offset)) selectedCharacterKind.value = shiftSelection(CHARACTERS, selectedCharacterKind.value, offset); },
    formation: computed(() => profile.value.equippedAllies.map((kind, index) => ({ index, kind, key: String(index + 1), label: kind ? UNIT_DEFINITIONS[kind].label : '빈 칸', image: kind ? assetUrl(characterArt(kind, profile.value.levels[kind])) : null }))),
    formationSummary: computed(() => profile.value.equippedAllies.map(kind => kind ? UNIT_DEFINITIONS[kind].label : '빈 칸').join(' · ')),
    roster: computed(() => ALLY_KINDS.map(kind => {
      const unlocked = profile.value.unlockedAllies.includes(kind);
      const equippedIndex = profile.value.equippedAllies.indexOf(kind);
      const definition = UNIT_DEFINITIONS[kind];
      return { kind, label: definition.label, level: profile.value.levels[kind], image: assetUrl(characterArt(kind, profile.value.levels[kind])), role: ALLY_ROLES[kind].role, description: ALLY_ROLES[kind].description, cost: definition.cost, cooldown: definition.summonCooldown, unlocked, equippedIndex,
        reason: !unlocked ? `${ALLY_UNLOCK_STAGES[kind]} 첫 클리어로 해금` : equippedIndex === selectedSlot.value ? '현재 선택 칸에 편성됨' : equippedIndex >= 0 ? `${equippedIndex + 1}번 칸과 교환` : `${selectedSlot.value + 1}번 칸에 편성`,
      };
    })),
    selectSlot: (index: number) => { if (currentLobby() && Number.isInteger(index) && index >= 0 && index < FORMATION_SIZE) selectedSlot.value = index; },
    equipAlly: (kind: AllyKind) => {
      if (!currentLobby()) return;
      const next = [...profile.value.equippedAllies];
      const existing = next.indexOf(kind);
      if (existing >= 0) next[existing] = next[selectedSlot.value];
      next[selectedSlot.value] = kind;
      upgradeFeedback.value = context.profile.setFormation(next).reason ?? '';
    },
    removeAlly: () => { if (currentLobby()) upgradeFeedback.value = context.profile.setSlot(selectedSlot.value, null).reason ?? ''; },
    selectedStage: computed(() => { const stage = STAGES.find(item => item.id === selectedStageId.value)!; return { ...stage, locked: !profile.value.unlockedStages.includes(stage.id), enemies: [...new Set(stage.spawns.map(spawn => UNIT_DEFINITIONS[spawn.kind].label))].join(' · ') }; }),
    selectStage: (id: string) => { if (!scope.disposed && STAGES.some(stage => stage.id === id)) selectedStageId.value = id; },
    stages: computed(() => STAGES.map(stage => ({ ...stage, locked: !profile.value.unlockedStages.includes(stage.id), cleared: profile.value.clearedStages.includes(stage.id) }))),
    skillLoadout: computed(() => Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => {
      const kind = profile.value.equippedSkills[index] ?? null;
      return { index, kind, label: kind ? SKILLS[kind].label : '빈 스킬 칸' };
    })),
    skillOwned: computed(() => (Object.keys(SKILLS) as SkillKind[]).map(kind => ({ kind, label: SKILLS[kind].label, description: SKILLS[kind].description, unlocked: profile.value.unlockedSkills.includes(kind), equipped: profile.value.equippedSkills.includes(kind) }))),
    selectSkillSlot: (index: number) => { if (currentLobby() && Number.isInteger(index) && index >= 0 && index < SKILL_SLOT_COUNT) selectedSkillSlot.value = Math.min(index, profile.value.equippedSkills.length); },
    equipSkill: (kind: SkillKind) => {
      if (!currentLobby()) return;
      const next = [...profile.value.equippedSkills];
      const existing = next.indexOf(kind);
      if (existing >= 0) next.splice(existing, 1);
      else next[Math.min(selectedSkillSlot.value, next.length)] = kind;
      const result = context.profile.setEquippedSkills(next);
      upgradeFeedback.value = result.reason ?? '';
      if (result.accepted) selectedSkillSlot.value = Math.min(selectedSkillSlot.value, next.length, SKILL_SLOT_COUNT - 1);
    },
    removeSkill: () => {
      if (!currentLobby()) return;
      const result = context.profile.setEquippedSkills(profile.value.equippedSkills.filter((_, index) => index !== selectedSkillSlot.value));
      upgradeFeedback.value = result.reason ?? '';
      if (result.accepted) selectedSkillSlot.value = Math.min(selectedSkillSlot.value, profile.value.equippedSkills.length, SKILL_SLOT_COUNT - 1);
    },
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
      const damage = kind === 'hero' ? SKILLS['hello-world'].damage : kind === 'counselor' ? SUPPORT.heal : UNIT_DEFINITIONS[kind].damage;
      const unlocked = kind === 'hero' || profile.value.unlockedAllies.includes(kind);
      const cost = upgradeCost(level);
      return { kind, label: kind === 'hero' ? '주인공 개발자' : UNIT_DEFINITIONS[kind].label, level, cost,
        evolved: level >= 5, growth: growth[kind], image: assetUrl(characterArt(kind, level)), preview: assetUrl(characterArt(kind, 5)),
        hp: Math.round(hp * multiplier), nextHp: Math.round(hp * nextMultiplier),
        statLabel: kind === 'support' ? '공격속도 ×' : kind === 'counselor' ? '회복' : kind === 'hero' ? '스킬 피해' : '공격', stat: kind === 'support' ? SUPPORT.hasteMultiplier : Math.round(damage * multiplier), nextStat: kind === 'support' ? SUPPORT.hasteMultiplier : Math.round(damage * nextMultiplier),
        unlocked, supportNote: kind === 'support' ? '공격 유닛만 · 반경 100 · 7초 / 5초마다 · 배율은 고정' : kind === 'counselor' ? '아군과 개발자 · 반경 100 · 5초마다 회복' : '',
        disabled: !unlocked || cost === null || profile.value.xp < cost,
        reason: !unlocked ? `${ALLY_UNLOCK_STAGES[kind as AllyKind]} 첫 클리어로 해금` : cost === null ? '최대 레벨' : profile.value.xp < cost ? `재화 ${cost - profile.value.xp} 부족` : `${cost} XP 강화`,
      };
    })),
    setLobbyTab: (value: 'menu' | 'stages' | 'training' | 'shop' | 'formation') => { if (!scope.disposed) tab.value = value; },
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
