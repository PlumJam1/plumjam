import { computed, effectScope, readonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneScope } from '../../core/SceneLifetimeManager';
import { ECONOMY, SKILLS, SUPPORT, UNIT_DEFINITIONS } from '../../game/battle/balance';
import { getCooldownEta, getSkillValues } from '../../game/BattleSession';
import { skillPreview } from '../../game/presentation/battlePresentation';
import type { AllyKind, BattleCommand, BattleSnapshot, SkillKind } from '../../game/battle/types';
import { getStage, nextStage } from '../../game/progression/stages';

/** View-independent display decisions; the session remains authoritative for every command. */
export function createBattleViewModel(context: AppContext, scope: SceneScope, showIntro: boolean) {
  const effects = effectScope(true);
  const battle = shallowRef<BattleSnapshot | null>(null);
  const feedback = shallowRef('');
  const intro = shallowRef(showIntro);
  const reward = shallowRef(0);
  const prototypeComplete = shallowRef(false);
  const previewSkill = shallowRef<SkillKind | null>(null);
  const bossNotice = shallowRef('');
  let defeatedBossCount = 0;
  let bossNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  scope.defer(() => { if (bossNoticeTimer) clearTimeout(bossNoticeTimer); });
  const previewSources = new Map<'hover' | 'focus', SkillKind>();
  const publishPreview = () => {
    const skill = battle.value?.status === 'active' ? [...previewSources.values()].at(-1) ?? null : null;
    if (skill === previewSkill.value) return;
    previewSkill.value = skill;
    context.bridge.emit('battle-preview', { runId: scope.id, skill });
  };
  const clearPreview = () => { previewSources.clear(); publishPreview(); };
  scope.defer(() => { previewSources.clear(); previewSkill.value = null; context.bridge.emit('battle-preview', { runId: scope.id, skill: null }); });
  scope.defer(context.bridge.subscribe('battle-result', value => {
    if (!scope.disposed && value.runId === scope.id) { reward.value = value.reward; prototypeComplete.value = value.prototypeComplete; }
  }));
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  scope.defer(() => { if (feedbackTimer) clearTimeout(feedbackTimer); });
  scope.defer(context.bridge.subscribe('battle-snapshot', (snapshot) => {
    if (scope.disposed || snapshot.runId !== scope.id) return;
    battle.value = snapshot;
    if (snapshot.status !== 'active') clearPreview();
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
    const availability = (cost: number, cooldown = 0): string => {
      const value = battle.value;
      if (!value) return '전투 준비 중';
      if (value.status !== 'active') return value.status === 'paused' ? '일시정지' : '전투 종료';
      if (cooldown > 0) return `준비 ${cooldown.toFixed(1)}초`;
      if (value.gold < cost) return `자금 ${Math.ceil(cost - value.gold)} 부족`;
      return '사용 가능';
    };
    const units = computed(() => (['melee', 'ranged', 'support'] as AllyKind[]).map((kind, index) => {
      const definition = UNIT_DEFINITIONS[kind];
      const cooldown = battle.value?.summonCooldowns[kind] ?? 0;
      const eta = getCooldownEta(cooldown, battle.value?.overclockRemaining ?? 0);
      const reason = availability(definition.cost!, eta);
      const description = kind === 'melee' ? '전선을 지키는 서류가방' : kind === 'ranged' ? '뒤에서 서류 던지기' : '5초마다 랜덤 힐 · 버프';
      return { kind, label: definition.label, cost: definition.cost!, key: String(index + 1), cooldown: eta,
        progress: 1 - cooldown / definition.summonCooldown!, reason, description, disabled: reason !== '사용 가능' };
    }));
    const skills = computed(() => (['hello-world', 'sleep', 'heal', 'git-push', 'overclock'] as SkillKind[]).map((kind, index) => {
      const definition = SKILLS[kind];
      const cooldown = battle.value?.skillCooldowns[kind] ?? 0;
      const eta = getCooldownEta(cooldown, battle.value?.overclockRemaining ?? 0, kind === 'overclock');
      const unlocked = battle.value?.unlockedSkills.includes(kind) ?? false;
      const reason = unlocked ? availability(definition.cost, eta) : '상점에서 해금';
      const hero = battle.value?.hero ?? { level: 1, buffs: { combat: 0, speed: 0 } };
      const values = getSkillValues(hero);
      const amount = (value: number) => Number(value.toFixed(1));
      const description = kind === 'hello-world' ? `피해 ${amount(values.helloDamage)} · 사거리 ${values.helloRange} · 오른쪽 첫 적` : kind === 'sleep' ? `반경 ${values.sleepRadius} · 이동속도 -${Math.round((1 - values.sleepSpeedMultiplier) * 100)}% · ${values.sleepDuration}초` : kind === 'heal' ? `회복 ${amount(values.healAmount)} · 반경 ${values.healRadius} · 나와 아군` : kind === 'git-push' ? `반경 ${values.pushRadius} · 일반 적 폭×3 / 보스 폭×1 밀기 · 적 기지 경계 제한` : `${values.overclockDuration}초간 소환·다른 스킬 쿨타임 50% · 자신 제외 · 수입 유지`;
      const effectLabel = kind === 'hello-world' ? `피해 ${amount(values.helloDamage)}` : kind === 'sleep' ? `감속 ${values.sleepDuration}초` : kind === 'heal' ? `회복 ${amount(values.healAmount)}` : kind === 'git-push' ? '밀치기 폭×3 / 보스×1' : `쿨타임 50% · ${values.overclockDuration}초`;
      return { kind, label: definition.label, cost: definition.cost, key: ['J', 'K', 'L', 'P', 'O'][index], cooldown: eta, unlocked,
        progress: 1 - cooldown / definition.cooldown, description, effectLabel, reason, disabled: reason !== '사용 가능' };
    }));
    const boss = computed(() => {
      const unit = battle.value?.units.find(unit => unit.kind === 'gpt-4o' && unit.hp > 0);
      if (!unit) return null;
      const telegraph = battle.value?.bossTelegraphs.find(value => value.ownerId === unit.id);
      return { hp: Math.ceil(unit.hp), maxHp: unit.maxHp, percent: Math.round(unit.hp / unit.maxHp * 100), progress: unit.hp / unit.maxHp,
        attack: telegraph ? `전방 범위 공격 ${telegraph.remaining.toFixed(1)}초` : `범위 공격 준비 ${unit.bossCooldown.toFixed(1)}초` };
    });
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
    const economyReason = computed(() => battle.value?.upgradeCost === null ? '최대 레벨' : availability(battle.value?.upgradeCost ?? Infinity));
    const economyDisabled = computed(() => economyReason.value !== '사용 가능');
    const economyDescription = computed(() => {
      const next = ECONOMY[battle.value?.economyLevel ?? 0];
      return next ? `수입 +${next.income}/초 · 상한 ${next.cap}` : '수입과 보유 상한 최대';
    });
    const time = computed(() => {
      const seconds = Math.floor(battle.value?.elapsed ?? 0);
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    });
    const resultTitle = computed(() => prototypeComplete.value ? '마지막 출근까지 지켰다!' : battle.value?.status === 'won' ? '오늘의 출근을 지켰다!' : '전선을 지키지 못했다.');
    const resultDescription = computed(() => prototypeComplete.value ? 'GPT-4o를 이겼어. 프로토타입의 5개 스테이지를 모두 클리어했어!' : battle.value?.status === 'won' ? 'AI 데이터센터를 파괴했어. 재화로 강화하거나 다음 출근에 도전해봐.' : battle.value?.defeatReason === 'hero' ? '개발자가 쓰러졌어. 병력 뒤에서 전선을 도와줘.' : '아군 기지가 파괴됐어. 병력과 경제 투자 타이밍을 바꿔봐.');
    const hasNextStage = computed(() => battle.value?.status === 'won' && !!nextStage(battle.value.stageId));
    return {
      battle: readonly(battle), feedback: readonly(feedback), intro: readonly(intro), units, skills, ended, danger,
      boss, bossNotice: readonly(bossNotice), waveNotice, heroBuffs, preview, previewDescription,
      economyDisabled, economyDescription, economyReason, time, resultTitle, resultDescription,
      reward: readonly(reward), prototypeComplete: readonly(prototypeComplete), hasNextStage,
      dismissIntro: () => { intro.value = false; },
      summon: (kind: AllyKind) => command({ type: 'summon', kind }),
      useSkill: (skill: SkillKind) => command({ type: 'skill', skill }),
      upgradeEconomy: () => command({ type: 'upgrade-economy' }),
      move: (direction: -1 | 0 | 1) => command({ type: 'move', direction }),
      previewSkill: (skill: SkillKind, source: 'hover' | 'focus', enabled: boolean) => {
        if (scope.disposed) return;
        if (enabled) previewSources.set(source, skill);
        else if (previewSources.get(source) === skill) previewSources.delete(source);
        publishPreview();
      },
    };
  })!;
  scope.defer(() => effects.stop());
  return model;
}
