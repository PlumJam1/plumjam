import { HERO_NAME } from '../../game/presentation/characterNames';
import type { BattleViewMode } from '../../game/presentation/battleCamera';
import { computed, effectScope, readonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneScope } from '../../core/SceneLifetimeManager';
import { ALLY_ROLES, ECONOMY, SKILLS, SUPPORT, UNIT_DEFINITIONS, SKILL_SLOT_COUNT, FORMATION_SIZE, FORMATION_PAGE_SIZE, SKILL_KEYS } from '../../game/battle/balance';
import { getCooldownEta, getSkillValues } from '../../game/BattleSession';
import { controlState, type ControlInput } from '../controlState';
import { getBossHud, skillPreview } from '../../game/presentation/battlePresentation';
import type { AllyKind, BattleCommand, BattleSnapshot, BattleSpeed, SkillKind } from '../../game/battle/types';
import { CHAPTERS, STAGES, getStage, nextStage } from '../../game/progression/stages';

/** View-independent display decisions; the session remains authoritative for every command. */
export function createBattleViewModel(context: AppContext, scope: SceneScope, showIntro: boolean) {
  const effects = effectScope(true);
  const battle = shallowRef<BattleSnapshot | null>(null);
  const feedback = shallowRef('');
  const unitPage = shallowRef<0 | 1>(0);
  const viewMode = shallowRef<BattleViewMode>('close');
  const activePageScope = () => {
    const current = context.bridge.sceneState;
    return !scope.disposed && !!battle.value && (battle.value.status === 'active' || battle.value.status === 'paused') && (!current || current.scene === 'Battle' && current.runId === scope.id);
  };
  scope.defer(context.bridge.subscribe('battle-page', value => {
    if (value.runId !== scope.id || (value.page !== 0 && value.page !== 1) || !activePageScope()) return;
    unitPage.value = value.page;
    // Removed DOM buttons need not fire blur: drop only details from the old visible five.
    for (const [source, detail] of detailSources) {
      if (detail.type === 'unit' && Math.floor(detail.slot / FORMATION_PAGE_SIZE) !== value.page) detailSources.delete(source);
    }
    if (lastDetail.value?.type === 'unit' && Math.floor(lastDetail.value.slot / FORMATION_PAGE_SIZE) !== value.page) lastDetail.value = null;
    publishDetail();
  }));
  const publishView = (mode: BattleViewMode) => {
    if (activePageScope() && (mode === 'close' || mode === 'overview')) context.bridge.emit('battle-view', { runId: scope.id, mode });
  };
  scope.defer(context.bridge.subscribe('battle-view', value => {
    if (value.runId === scope.id && (value.mode === 'close' || value.mode === 'overview') && activePageScope()) viewMode.value = value.mode;
  }));
  const intro = shallowRef(showIntro);
  const reward = shallowRef(0);
  const newAllies = shallowRef<readonly AllyKind[]>([]);
  const prototypeComplete = shallowRef(false);
  const previewSkill = shallowRef<SkillKind | null>(null);
  const bossNotice = shallowRef('');
  type Detail = { type: 'unit'; slot: number } | { type: 'skill'; kind: SkillKind } | { type: 'economy' };
  const detailSources = new Map<'hover' | 'focus', Detail>();
  const selectedDetail = shallowRef<Detail | null>(null);
  const lastDetail = shallowRef<Detail | null>(null);
  const detailRegionSources = new Set<'hover' | 'focus'>();
  const detailRegionActive = shallowRef(false);
  const publishDetail = () => {
    selectedDetail.value = [...detailSources.values()].at(-1) ?? null;
    if (selectedDetail.value) lastDetail.value = selectedDetail.value;
  };
  const clearDetail = () => {
    detailSources.clear(); selectedDetail.value = null; lastDetail.value = null;
    detailRegionSources.clear(); detailRegionActive.value = false;
  };
  scope.defer(clearDetail);
  let defeatedBossCount = 0;
  let bossNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  scope.defer(() => { if (bossNoticeTimer) clearTimeout(bossNoticeTimer); });
  const previewSources = new Map<'hover' | 'focus', SkillKind>();
  const publishPreview = () => {
    const candidate = [...previewSources.values()].at(-1) ?? null;
    const skill = activePageScope() && battle.value?.status === 'active' && candidate && battle.value.equippedSkills.includes(candidate) ? candidate : null;
    if (skill === previewSkill.value) return;
    previewSkill.value = skill;
    context.bridge.emit('battle-preview', { runId: scope.id, skill });
  };
  const clearPreview = () => { previewSources.clear(); publishPreview(); };
  scope.defer(() => { previewSources.clear(); previewSkill.value = null; context.bridge.emit('battle-preview', { runId: scope.id, skill: null }); });
  scope.defer(context.bridge.subscribe('battle-result', value => {
    if (!scope.disposed && value.runId === scope.id) { reward.value = value.reward; prototypeComplete.value = value.prototypeComplete; newAllies.value = value.newlyUnlockedAllies ?? []; }
  }));
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  scope.defer(() => { if (feedbackTimer) clearTimeout(feedbackTimer); });
  scope.defer(context.bridge.subscribe('battle-snapshot', (snapshot) => {
    if (scope.disposed || snapshot.runId !== scope.id) return;
    battle.value = snapshot;
    if (snapshot.status !== 'active') { clearPreview(); clearDetail(); }
    if (snapshot.defeatedBossCount > defeatedBossCount) {
      bossNotice.value = 'GPT-4o 격파!';
      if (bossNoticeTimer) clearTimeout(bossNoticeTimer);
      bossNoticeTimer = setTimeout(() => { if (!scope.disposed) bossNotice.value = ''; }, 3000);
    }
    defeatedBossCount = snapshot.defeatedBossCount;
  }));
  scope.defer(context.bridge.subscribe('battle-feedback', ({ runId, result }) => {
    if (scope.disposed || runId !== scope.id || (result.accepted && !result.reason)) return;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedback.value = result.reason ?? '';
    if (feedback.value) feedbackTimer = setTimeout(() => { if (!scope.disposed) feedback.value = ''; }, 2600);
  }));
  const command = (value: BattleCommand) => {
    if (!scope.disposed) context.bridge.emit('battle-command', { runId: scope.id, command: value });
  };
  const model = effects.run(() => {
    const ended = computed(() => battle.value?.status === 'won' || battle.value?.status === 'lost');
    const danger = computed(() => (battle.value?.hero.hp ?? 1) <= (battle.value?.hero.maxHp ?? 1) * 0.3);
    const availability = (cost: number, cooldown = 0, extra: Partial<ControlInput> = {}) => controlState({ battle: battle.value, cost, cooldown, ...extra });
    const units = computed(() => (battle.value?.equippedAllies ?? Array<null>(FORMATION_SIZE).fill(null)).map((kind, index) => {
      if (kind === null) return { kind, label: '빈 칸', cost: 0, key: String(index % FORMATION_PAGE_SIZE + 1), slotIndex: index, cooldown: 0, progress: 0, ...availability(0, 0, { empty: true }), description: '이 칸에는 소환할 동료가 없어', level: 1 };
      const definition = UNIT_DEFINITIONS[kind];
      const cooldown = battle.value?.summonCooldowns[kind] ?? 0;
      const eta = getCooldownEta(cooldown, battle.value?.overclockRemaining ?? 0);
      const presentation = availability(definition.cost!, eta);
      const description = ALLY_ROLES[kind].description;
      return { kind, label: definition.label, cost: definition.cost!, key: String(index % FORMATION_PAGE_SIZE + 1), slotIndex: index, cooldown: eta,
        level: battle.value?.levels[kind] ?? 1, progress: 1 - cooldown / definition.summonCooldown!, ...presentation, description };
    }));
    const visibleUnits = computed(() => units.value.slice(unitPage.value * FORMATION_PAGE_SIZE, (unitPage.value + 1) * FORMATION_PAGE_SIZE));
    const viewModeLabel = computed(() => viewMode.value === 'close' ? '근접 시점' : '전체 전장');
    const viewDisabled = computed(() => !battle.value || ended.value);
    const pageDisabled = computed(() => !battle.value || ended.value);
    const allSkills = computed(() => (Object.keys(SKILLS) as SkillKind[]).map((kind) => {
      const definition = SKILLS[kind];
      const cooldown = battle.value?.skillCooldowns[kind] ?? 0;
      const eta = getCooldownEta(cooldown, battle.value?.overclockRemaining ?? 0, kind === 'overclock');
      const unlocked = battle.value?.unlockedSkills.includes(kind) ?? false;
      const equipped = battle.value?.equippedSkills.includes(kind) ?? false;
      const presentation = availability(definition.cost, eta, { unlocked, equipped });
      const hero = battle.value?.hero ?? { level: 1, buffs: { combat: 0, speed: 0, haste: 0 } };
      const values = getSkillValues(hero);
      const amount = (value: number) => Number(value.toFixed(1));
      const description = kind === 'hello-world' ? `피해 ${amount(values.helloDamage)} · 사거리 ${values.helloRange} · 오른쪽 첫 적` : kind === 'sleep' ? `반경 ${values.sleepRadius} · 이동속도 -${Math.round((1 - values.sleepSpeedMultiplier) * 100)}% · ${values.sleepDuration}초` : kind === 'heal' ? `회복 ${amount(values.healAmount)} · 반경 ${values.healRadius} · 나와 아군` : kind === 'foreach' ? `피해 ${amount(values.foreachDamage)} · 전방 ${values.foreachOffset} · 반경 ${values.foreachRadius} · ${values.foreachFlight}초 뒤 착지, 적 유닛만` : kind === 'git-push' ? `반경 ${values.pushRadius} · 일반 적 폭×3 / 보스 폭×1 서서히 밀기 · 적 기지 경계 제한` : `${values.overclockDuration}초간 소환·다른 스킬 쿨타임 50% · 자신 제외 · 수입 유지 · 자금 비축 후 사용`;
      const effectLabel = kind === 'hello-world' ? `피해 ${amount(values.helloDamage)}` : kind === 'sleep' ? `감속 ${values.sleepDuration}초` : kind === 'heal' ? `회복 ${amount(values.healAmount)}` : kind === 'foreach' ? `광역 피해 ${amount(values.foreachDamage)}` : kind === 'git-push' ? '밀치기 폭×3 / 보스×1' : `쿨타임 50% · ${values.overclockDuration}초`;
      return { kind, label: definition.label, cost: definition.cost, key: SKILL_KEYS[kind], cooldown: eta, unlocked,
        equipped, progress: 1 - cooldown / definition.cooldown, description, effectLabel, ...presentation };
    }));
    const skills = computed(() => (battle.value?.equippedSkills ?? []).flatMap(kind => allSkills.value.filter(skill => skill.kind === kind)));
    const primarySkill = computed(() => skills.value[0] ?? null);
    const skillSlots = computed(() => Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => skills.value[index] ?? null));
    const speed = computed(() => battle.value?.speed ?? 1);
    const effectiveSpeed = computed(() => battle.value?.effectiveSpeed ?? speed.value);
    const bossAssistEnabled = computed(() => battle.value?.bossAssistEnabled ?? true);
    const bossAssistActive = computed(() => battle.value?.bossAssistActive ?? false);
    const bossAssistLabel = computed(() => bossAssistActive.value ? `예고 보호 1배 · 선택 ${speed.value}배` : '');
    const speedSummary = computed(() => `선택 ${speed.value}배 · 현재 ${effectiveSpeed.value}배`);
    const speedDisabled = computed(() => !battle.value || ended.value);
    const boss = computed(() => battle.value ? getBossHud(battle.value) : null);
    const waveNotice = computed(() => {
      const snapshot = battle.value;
      if (!snapshot || snapshot.status !== 'active') return '';
      return getStage(snapshot.stageId)?.waveNotices?.find(notice => snapshot.elapsed >= notice.at && snapshot.elapsed < notice.at + notice.duration)?.label ?? '';
    });
    const heroBuffs = computed(() => {
      const buffs = battle.value?.hero.buffs;
      return buffs ? [buffs.combat > 0 ? `공격 +${Math.round((SUPPORT.damageMultiplier - 1) * 100)}% · 받는 피해 -${Math.round((1 - SUPPORT.receivedDamageMultiplier) * 100)}% ${buffs.combat.toFixed(1)}초` : '', buffs.speed > 0 ? `이동 +${Math.round((SUPPORT.speedMultiplier - 1) * 100)}% ${buffs.speed.toFixed(1)}초` : '', (battle.value?.overclockRemaining ?? 0) > 0 ? `overclock 소환·스킬 쿨타임 50% ${battle.value!.overclockRemaining.toFixed(1)}초` : ''].filter(Boolean) : [];
    });
    const preview = computed(() => battle.value ? skillPreview(battle.value, previewSkill.value) : null);
    const previewDescription = computed(() => skills.value.find(skill => skill.kind === previewSkill.value)?.description ?? '');
    const previewTargets = computed(() => preview.value?.shape === 'line' ? `현재 예상 대상: ${preview.value.targetLabel} · 이동 중 달라질 수 있음` : preview.value ? `대상 ${preview.value.targetIds.length}명` : '');
    const economyState = computed(() => availability(battle.value?.upgradeCost ?? Infinity, 0, { max: battle.value?.upgradeCost === null }));
    const economyReason = computed(() => economyState.value.reason);
    const economyDisabled = computed(() => economyState.value.disabled);
    const economyDescription = computed(() => {
      const next = ECONOMY[battle.value?.economyLevel ?? 0];
      return next ? `수입 +${next.income}/초 · 상한 ${next.cap}` : '수입과 보유 상한 최대';
    });
    const controlDetail = computed(() => {
      const detail = selectedDetail.value ?? (detailRegionActive.value ? lastDetail.value : null);
      if (!detail) return null;
      if (detail.type === 'unit') {
        const unit = visibleUnits.value.find(value => value.slotIndex === detail.slot);
        return unit ? { type: detail.type, name: `${unit.slotIndex + 1}번 ${unit.label}`, key: unit.key, cost: unit.kind ? `${unit.cost}원` : '', reason: unit.reason, description: unit.description, status: unit.status } : null;
      }
      if (detail.type === 'skill') {
        const skill = allSkills.value.find(value => value.kind === detail.kind);
        return skill ? { type: detail.type, name: skill.label, key: skill.key, cost: `${skill.cost}원`, reason: skill.reason, description: skill.description, status: skill.status } : null;
      }
      return { type: detail.type, name: '경제 투자', key: 'U', cost: battle.value?.upgradeCost === null ? '' : `${battle.value?.upgradeCost ?? 0}원`, reason: economyReason.value, description: economyDescription.value, status: economyState.value.status };
    });
    const time = computed(() => {
      const seconds = Math.floor(battle.value?.elapsed ?? 0);
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    });
    const campaignComplete = computed(() => prototypeComplete.value && battle.value?.status === 'won' && !!getStage(battle.value.stageId) && !nextStage(battle.value.stageId));
    const resultTitle = computed(() => campaignComplete.value ? '마지막 출근까지 지켰다!' : battle.value?.status === 'won' ? '오늘의 출근을 지켰다!' : '전선을 지키지 못했다.');
    const resultDescription = computed(() => campaignComplete.value ? `GPT-4o를 이겼어. ${CHAPTERS.length}개 챕터 · ${STAGES.length}개 스테이지를 모두 클리어했어!` : battle.value?.status === 'won' ? 'AI 데이터센터를 파괴했어. 재화로 강화하거나 다음 출근에 도전해봐.' : battle.value?.defeatReason === 'hero' ? `${HERO_NAME}가 쓰러졌어. 병력 뒤에서 전선을 도와줘.` : '아군 기지가 파괴됐어. 병력과 경제 투자 타이밍을 바꿔봐.');
    const hasNextStage = computed(() => battle.value?.status === 'won' && !!nextStage(battle.value.stageId));
    return {
      battle: readonly(battle), feedback: readonly(feedback), intro: readonly(intro), units, visibleUnits, unitPage: readonly(unitPage), pageDisabled, viewMode: readonly(viewMode), viewModeLabel, viewDisabled, skills, allSkills, primarySkill, skillSlots, speed, effectiveSpeed, bossAssistEnabled, bossAssistActive, bossAssistLabel, speedSummary, speedDisabled, ended, danger,
      boss, bossNotice: readonly(bossNotice), waveNotice, heroBuffs, preview, previewDescription, previewTargets,
      economyDisabled, economyDescription, economyReason, economyState, controlDetail, time, resultTitle, resultDescription,
      newAllies: computed(() => newAllies.value.map(kind => ({ kind, label: UNIT_DEFINITIONS[kind].label }))), reward: readonly(reward), prototypeComplete: campaignComplete, hasNextStage,
      setViewMode: publishView,
      toggleViewMode: () => publishView(viewMode.value === 'close' ? 'overview' : 'close'),
      setUnitPage: (page: 0 | 1) => { if (activePageScope() && (page === 0 || page === 1)) context.bridge.emit('battle-page', { runId: scope.id, page }); },
      setSpeed: (value: BattleSpeed) => {
        const current = context.bridge.sceneState;
        if (scope.disposed || !battle.value || ended.value || ![1, 2, 3].includes(value) || current && (current.scene !== 'Battle' || current.runId !== scope.id)) return;
        command({ type: 'set-speed', speed: value });
      },
      setBossAssist: (enabled: boolean) => {
        if (typeof enabled === 'boolean' && activePageScope()) command({ type: 'set-boss-assist', enabled });
      },
      toggleBossAssist: () => {
        if (activePageScope()) command({ type: 'set-boss-assist', enabled: !bossAssistEnabled.value });
      },
      setDetailRegionActive: (source: 'hover' | 'focus', enabled: boolean) => {
        if (scope.disposed) return;
        if (enabled && battle.value?.status === 'active') detailRegionSources.add(source);
        else detailRegionSources.delete(source);
        detailRegionActive.value = detailRegionSources.size > 0;
      },
      describeUnit: (slot: number, source: 'hover' | 'focus', enabled: boolean) => {
        if (scope.disposed) return;
        if (enabled && battle.value?.status === 'active' && visibleUnits.value.some(unit => unit.slotIndex === slot)) detailSources.set(source, { type: 'unit', slot });
        else if (detailSources.get(source)?.type === 'unit' && (detailSources.get(source) as { slot: number }).slot === slot) detailSources.delete(source);
        publishDetail();
      },
      describeEconomy: (source: 'hover' | 'focus', enabled: boolean) => {
        if (scope.disposed) return;
        if (enabled && battle.value?.status === 'active') detailSources.set(source, { type: 'economy' });
        else if (detailSources.get(source)?.type === 'economy') detailSources.delete(source);
        publishDetail();
      },
      dismissIntro: () => { intro.value = false; },
      summon: (kind: AllyKind | null) => { if (kind !== null) command({ type: 'summon', kind }); },
      useSkill: (skill: SkillKind) => { const entry = allSkills.value.find(value => value.kind === skill); if (activePageScope() && entry && !entry.disabled) command({ type: 'skill', skill }); },
      upgradeEconomy: () => command({ type: 'upgrade-economy' }),
      move: (direction: -1 | 0 | 1) => command({ type: 'move', direction }),
      previewSkill: (skill: SkillKind, source: 'hover' | 'focus', enabled: boolean) => {
        if (scope.disposed) return;
        if (enabled) previewSources.set(source, skill);
        else if (previewSources.get(source) === skill) previewSources.delete(source);
        if (enabled && activePageScope() && battle.value?.status === 'active') detailSources.set(source, { type: 'skill', kind: skill });
        else if (detailSources.get(source)?.type === 'skill' && (detailSources.get(source) as { kind: SkillKind }).kind === skill) detailSources.delete(source);
        publishDetail();
        publishPreview();
      },
    };
  })!;
  scope.defer(() => effects.stop());
  return model;
}
