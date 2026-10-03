import { computed, effectScope, readonly, shallowReadonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneState, SceneCommand } from '../../core/GameBridge';
import type { SceneScope } from '../../core/SceneLifetimeManager';
import { createBattleViewModel } from './BattleViewModel';

function createScreenViewModel(context: AppContext, scope: SceneScope, initial: SceneState, showIntro: boolean) {
  const effects = effectScope(true);
  const state = shallowRef(initial);
  const battleModel = createBattleViewModel(context, scope, showIntro);
  const model = effects.run(() => {
    const isBattle = computed(() => state.value.scene === 'Battle');
    const isPaused = computed(() => state.value.phase === 'paused');
    const statusLabel = computed(() => isBattle.value
      ? `${state.value.stageId} · ${isPaused.value ? '일시정지' : battleModel.ended.value ? '전투 종료' : battleModel.time.value}`
      : '출근 전 준비실');
    const command = (value: SceneCommand) => {
      if (!scope.disposed) context.bridge.emit('scene-command', { runId: scope.id, command: value });
    };
    return {
      ...battleModel, statusLabel,
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
  let seenBattleIntro = false;
  const screen = shallowRef<ReturnType<typeof createScreenViewModel> | null>(null);
  const receive = (state: SceneState) => {
    if (screen.value?.state.value.runId === state.runId) screen.value.update(state);
    else {
      const scope = context.lifetimes.getScope(state.runId);
      if (scope && !scope.disposed) {
        screen.value = createScreenViewModel(context, scope, state, state.scene === 'Battle' && !seenBattleIntro);
        if (state.scene === 'Battle') seenBattleIntro = true;
      }
    }
  };
  const unsubscribe = context.bridge.subscribe('scene-state', receive);
  if (context.bridge.sceneState) receive(context.bridge.sceneState);
  return { screen: shallowReadonly(screen), dispose: unsubscribe };
}
