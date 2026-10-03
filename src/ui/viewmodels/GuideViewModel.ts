import { effectScope, readonly, shallowRef, watch } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { BattleSnapshot } from '../../game/battle/types';

export type GuideMode = 'help' | 'credits';
/** App-owned reading panel; opening it never pauses, progresses or commands a scene. */
export function createGuideViewModel(context: AppContext, blocked: () => boolean) {
  const effects = effectScope(true);
  const isOpen = shallowRef(false);
  const mode = shallowRef<GuideMode>('help');
  let disposed = false;
  let snapshot: BattleSnapshot | null = null;
  let ownerRun: number | undefined;
  let detachOwner: (() => void) | undefined;
  const close = () => { isOpen.value = false; ownerRun = undefined; detachOwner?.(); detachOwner = undefined; };
  const allowed = () => {
    const state = context.bridge.sceneState;
    if (disposed || blocked() || !state || context.lifetimes.getScope(state.runId)?.disposed !== false) return false;
    return state.scene === 'Lobby' && state.phase === 'ready' || state.scene === 'Battle' && (state.phase === 'paused' || state.phase === 'ready' && snapshot?.runId === state.runId && ['won', 'lost'].includes(snapshot.status));
  };
  const open = (value: GuideMode) => {
    if ((value !== 'help' && value !== 'credits') || !allowed()) return;
    const state = context.bridge.sceneState!;
    if (ownerRun !== state.runId) {
      close(); const signal = context.lifetimes.getScope(state.runId)!.signal;
      signal.addEventListener('abort', close, { once: true });
      detachOwner = () => signal.removeEventListener('abort', close);
      ownerRun = state.runId;
    }
    mode.value = value; isOpen.value = true;
  };
  const offState = context.bridge.subscribe('scene-state', state => {
    if (snapshot?.runId !== state.runId || state.scene !== 'Battle') snapshot = null;
    if (isOpen.value && (ownerRun !== state.runId || !allowed())) close();
  });
  const offBattle = context.bridge.subscribe('battle-snapshot', value => {
    const state = context.bridge.sceneState;
    if (state?.scene !== 'Battle' || state.runId !== value.runId || context.lifetimes.getScope(value.runId)?.disposed !== false) return;
    snapshot = value;
    if (isOpen.value && (value.status === 'active' || !allowed())) close();
  });
  effects.run(() => watch(blocked, value => { if (value) close(); }, { flush: 'sync' }));
  return { isOpen: readonly(isOpen), mode: readonly(mode), open, setMode: open, close,
    dispose: () => { if (disposed) return; disposed = true; close(); offState(); offBattle(); effects.stop(); snapshot = null; } };
}
export type GuideViewModel = ReturnType<typeof createGuideViewModel>;
