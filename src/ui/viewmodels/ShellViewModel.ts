import { computed, effectScope, readonly, shallowReadonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneState, SceneCommand } from '../../core/GameBridge';
import type { SceneScope } from '../../core/SceneLifetimeManager';

function createScreenViewModel(context: AppContext, scope: SceneScope, initial: SceneState) {
  const effects = effectScope(true);
  const state = shallowRef(initial);
  const model = effects.run(() => {
    const isBattle = computed(() => state.value.scene === 'Battle');
    const isPaused = computed(() => state.value.phase === 'paused');
    const command = (value: SceneCommand) => {
      if (!scope.disposed) context.bridge.emit('scene-command', { runId: scope.id, command: value });
    };
    return {
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
