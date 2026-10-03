import { computed, effectScope, readonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneScope } from '../../core/SceneLifetimeManager';
import { ECONOMY, SKILLS, UNIT_DEFINITIONS } from '../../game/battle/balance';
import type { AllyKind, BattleCommand, BattleSnapshot, SkillKind } from '../../game/battle/types';
import { nextStage } from '../../game/progression/stages';

/** View-independent display decisions; the session remains authoritative for every command. */
export function createBattleViewModel(context: AppContext, scope: SceneScope, showIntro: boolean) {
  const effects = effectScope(true);
  const battle = shallowRef<BattleSnapshot | null>(null);
  const feedback = shallowRef('');
  const intro = shallowRef(showIntro);
  const reward = shallowRef(0);
  const prototypeComplete = shallowRef(false);
  scope.defer(context.bridge.subscribe('battle-result', value => {
    if (!scope.disposed && value.runId === scope.id) { reward.value = value.reward; prototypeComplete.value = value.prototypeComplete; }
  }));
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  scope.defer(() => { if (feedbackTimer) clearTimeout(feedbackTimer); });
  scope.defer(context.bridge.subscribe('battle-snapshot', (snapshot) => {
    if (!scope.disposed && snapshot.runId === scope.id) battle.value = snapshot;
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
      const reason = availability(definition.cost!, cooldown);
      const description = kind === 'melee' ? '전선을 지키는 서류가방' : kind === 'ranged' ? '뒤에서 서류 던지기' : '5초마다 랜덤 힐 · 버프';
      return { kind, label: definition.label, cost: definition.cost!, key: String(index + 1), cooldown,
        progress: 1 - cooldown / definition.summonCooldown!, reason, description, disabled: reason !== '사용 가능' };
    }));
    const skills = computed(() => (['hello-world', 'sleep', 'heal'] as SkillKind[]).map((kind, index) => {
      const definition = SKILLS[kind];
      const cooldown = battle.value?.skillCooldowns[kind] ?? 0;
      const reason = availability(definition.cost, cooldown);
      return { kind, label: definition.label, cost: definition.cost, key: ['J', 'K', 'L'][index], cooldown,
        progress: 1 - cooldown / definition.cooldown, description: definition.description, reason, disabled: reason !== '사용 가능' };
    }));
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
      economyDisabled, economyDescription, economyReason, time, resultTitle, resultDescription,
      reward: readonly(reward), prototypeComplete: readonly(prototypeComplete), hasNextStage,
      dismissIntro: () => { intro.value = false; },
      summon: (kind: AllyKind) => command({ type: 'summon', kind }),
      useSkill: (skill: SkillKind) => command({ type: 'skill', skill }),
      upgradeEconomy: () => command({ type: 'upgrade-economy' }),
      move: (direction: -1 | 0 | 1) => command({ type: 'move', direction }),
    };
  })!;
  scope.defer(() => effects.stop());
  return model;
}
