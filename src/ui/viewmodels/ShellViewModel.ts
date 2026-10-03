import { computed, effectScope, readonly, shallowReadonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneState, SceneCommand } from '../../core/GameBridge';
import { UNIT_DEFINITIONS } from '../../game/battle/balance';
import type { AllyKind, BattleCommand, BattleSnapshot } from '../../game/battle/types';
import type { SceneScope } from '../../core/SceneLifetimeManager';

function createScreenViewModel(context: AppContext, scope: SceneScope, initial: SceneState) {
  const effects = effectScope(true);
  const state = shallowRef(initial);
  const battle = shallowRef<BattleSnapshot | null>(null);
  const feedback = shallowRef('');
  scope.defer(context.bridge.subscribe('battle-snapshot', (snapshot) => {
    if (!scope.disposed && snapshot.runId === scope.id) battle.value = snapshot;
  }));
  scope.defer(context.bridge.subscribe('battle-feedback', ({ runId, result }) => {
    if (!scope.disposed && runId === scope.id) feedback.value = result.accepted ? '' : result.reason ?? '';
  }));
  const model = effects.run(() => {
    const isBattle = computed(() => state.value.scene === 'Battle');
    const isPaused = computed(() => state.value.phase === 'paused');
    const ended = computed(() => battle.value?.status === 'won' || battle.value?.status === 'lost');
    const economyDisabled = computed(() => battle.value?.status !== 'active' || battle.value.upgradeCost === null || battle.value.gold < battle.value.upgradeCost);
    const time = computed(() => {
      const seconds = Math.floor(battle.value?.elapsed ?? 0);
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    });
    const statusLabel = computed(() => isBattle.value
      ? `${state.value.stageId} · ${isPaused.value ? '일시정지' : ended.value ? '전투 종료' : time.value}`
      : '출근 전 준비실');
    const command = (value: SceneCommand) => {
      if (!scope.disposed) context.bridge.emit('scene-command', { runId: scope.id, command: value });
    };
    const battleCommand = (value: BattleCommand) => {
      if (!scope.disposed) context.bridge.emit('battle-command', { runId: scope.id, command: value });
    };
    const units = computed(() => (['melee', 'ranged'] as AllyKind[]).map((kind, index) => {
      const definition = UNIT_DEFINITIONS[kind];
      const cooldown = battle.value?.summonCooldowns[kind] ?? 0;
      return { kind, label: definition.label, cost: definition.cost!, key: String(index + 1), cooldown,
        disabled: battle.value?.status !== 'active' || cooldown > 0 || (battle.value?.gold ?? 0) < definition.cost! };
    }));
    return {
      battle: readonly(battle), feedback: readonly(feedback), units, ended, economyDisabled, time, statusLabel,
      summon: (kind: AllyKind) => battleCommand({ type: 'summon', kind }),
      upgradeEconomy: () => battleCommand({ type: 'upgrade-economy' }),
      move: (direction: -1 | 0 | 1) => battleCommand({ type: 'move', direction }),
      state: readonly(state), isBattle, isPaused,
      update: (value: SceneState) => { if (!scope.disposed) state.value = value; },
      startBattle: () => command({ type: 'start-battle', stageId: '1-1' }),
      returnLobby: () => command({ type: 'return-lobby' }),
      restartBattle: () => command({ type: 'restart-battle' }),
      togglePause: () => command({ type: 'toggle-pause' }),
    };
  })!;
  scope.defer(() => effects.stop());
  return model;
}

export function createShellViewModel(context: AppContext) {
  const screen = shallowRef<ReturnType<typeof createScreenViewModel> | null>(null);
  const receive = (state: SceneState) => {
    if (screen.value?.state.value.runId === state.runId) screen.value.update(state);
    else {
      const scope = context.lifetimes.getScope(state.runId);
      if (scope && !scope.disposed) screen.value = createScreenViewModel(context, scope, state);
    }
  };
  const unsubscribe = context.bridge.subscribe('scene-state', receive);
  if (context.bridge.sceneState) receive(context.bridge.sceneState);
  return { screen: shallowReadonly(screen), dispose: unsubscribe };
}
