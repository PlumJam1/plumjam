import { computed, effectScope, readonly, shallowRef } from 'vue';
import type { AppContext } from '../../core/AppContext';
import type { SceneState } from '../../core/GameBridge';
import { getStory, isStoryUnlocked, STORIES, type Story, type StoryId } from '../../game/progression/story';

/** App-owned narrative display. Eligibility follows progress; reading never advances gameplay. */
export function createStoryViewModel(context: AppContext) {
  const effects = effectScope(true);
  const profile = shallowRef(context.profile.snapshot());
  const currentStory = shallowRef<Story | null>(null);
  const pageIndex = shallowRef(0);
  const origin = shallowRef<'auto' | 'archive' | null>(null);
  const archiveOpen = shallowRef(false);
  const feedback = shallowRef('');
  let disposed = false;
  let owner: Pick<SceneState, 'scene' | 'runId' | 'stageId'> | null = null;
  const ownerObservers = new Map<number, { signal: AbortSignal; abort: () => void }>();
  let lastWon: { runId: number; stageId: string } | null = null;
  const liveState = () => {
    const state = context.bridge.sceneState;
    return state && context.lifetimes.getScope(state.runId)?.disposed === false ? state : null;
  };
  const ownerAlive = () => {
    const state = liveState();
    return !disposed && !!owner && state?.scene === owner.scene && state.runId === owner.runId && (owner.scene !== 'Battle' || state.stageId === owner.stageId);
  };
  const cancelOverlay = () => { currentStory.value = null; archiveOpen.value = false; origin.value = null; pageIndex.value = 0; owner = null; feedback.value = ''; };
  const observeOwner = (state: SceneState) => {
    const scope = context.lifetimes.getScope(state.runId);
    if (!scope || scope.disposed) return false;
    if (!ownerObservers.has(state.runId)) {
      const abort = () => {
        ownerObservers.delete(state.runId);
        if (owner?.runId === state.runId) cancelOverlay();
        if (lastWon?.runId === state.runId) lastWon = null;
      };
      ownerObservers.set(state.runId, { signal: scope.signal, abort });
      scope.signal.addEventListener('abort', abort, { once: true });
    }
    return true;
  };
  const show = (story: Story, source: 'auto' | 'archive', state: SceneState) => {
    if (!observeOwner(state)) return;
    currentStory.value = story; pageIndex.value = 0; origin.value = source;
    owner = { scene: state.scene, runId: state.runId, stageId: state.stageId }; feedback.value = '';
  };
  const tryAutomatic = () => {
    if (disposed || currentStory.value || archiveOpen.value) return;
    const state = liveState();
    if (!state) return;
    let eligible: Story | undefined;
    if (state.scene === 'Lobby' && state.phase === 'ready') {
      eligible = STORIES.find(story => isStoryUnlocked(story, profile.value.clearedStages) && !profile.value.seenStoryIds.includes(story.id));
    } else if (state.scene === 'Battle' && lastWon?.runId === state.runId && lastWon.stageId === state.stageId) {
      eligible = STORIES.find(story => story.unlockedBy === state.stageId && isStoryUnlocked(story, profile.value.clearedStages) && !profile.value.seenStoryIds.includes(story.id));
    }
    if (eligible) show(eligible, 'auto', state);
  };
  const complete = () => {
    if (!ownerAlive() || !currentStory.value) return;
    const result = context.profile.markStorySeen(currentStory.value.id);
    if (!result.accepted) { feedback.value = result.reason ?? '이 이야기를 아직 완료할 수 없어.'; return; }
    const replay = origin.value === 'archive';
    currentStory.value = null; pageIndex.value = 0; origin.value = null; feedback.value = '';
    if (!replay) { owner = null; tryAutomatic(); }
  };
  const unsubscribeProfile = context.profile.subscribe(value => {
    if (disposed) return;
    profile.value = value;
    if (currentStory.value && !isStoryUnlocked(currentStory.value, value.clearedStages)) { cancelOverlay(); lastWon = null; }
    if (lastWon && !value.clearedStages.includes(lastWon.stageId)) lastWon = null;
  });
  const unsubscribeScene = context.bridge.subscribe('scene-state', state => {
    if (disposed) return;
    if (owner && (owner.runId !== state.runId || owner.scene !== state.scene || owner.scene === 'Battle' && owner.stageId !== state.stageId)) cancelOverlay();
    if (lastWon && (lastWon.runId !== state.runId || state.scene !== 'Battle')) lastWon = null;
    tryAutomatic();
  });
  const unsubscribeBattle = context.bridge.subscribe('battle-snapshot', snapshot => {
    if (disposed || snapshot.status !== 'won') return;
    const state = liveState();
    if (state?.scene !== 'Battle' || state.runId !== snapshot.runId || state.stageId !== snapshot.stageId || !profile.value.clearedStages.includes(snapshot.stageId)) return;
    if (!STORIES.some(story => story.unlockedBy === snapshot.stageId)) return;
    lastWon = { runId: snapshot.runId, stageId: snapshot.stageId }; tryAutomatic();
  });
  const model = effects.run(() => ({
    currentStory: readonly(currentStory), pageIndex: readonly(pageIndex), origin: readonly(origin), feedback: readonly(feedback),
    currentPage: computed(() => currentStory.value?.pages[pageIndex.value] ?? null),
    total: computed(() => currentStory.value?.pages.length ?? 0),
    hasPrev: computed(() => !!currentStory.value && pageIndex.value > 0),
    isLast: computed(() => !!currentStory.value && pageIndex.value === currentStory.value.pages.length - 1),
    archiveVisible: computed(() => archiveOpen.value && !currentStory.value),
    hasOverlay: computed(() => !!currentStory.value || archiveOpen.value),
    archiveEntries: computed(() => STORIES.map(story => ({ ...story, unlocked: isStoryUnlocked(story, profile.value.clearedStages), seen: profile.value.seenStoryIds.includes(story.id), reason: story.unlockedBy ? `${story.unlockedBy} 첫 클리어로 해금` : '처음부터 읽을 수 있어' }))),
    openArchive: () => {
      const state = liveState();
      if (disposed || currentStory.value || !state || state.scene !== 'Lobby' || state.phase !== 'ready') return;
      if (!observeOwner(state)) return;
      archiveOpen.value = true; owner = { scene: state.scene, runId: state.runId }; feedback.value = '';
    },
    closeArchive: () => { if (ownerAlive()) { cancelOverlay(); tryAutomatic(); } },
    playUnlockedStory: (id: StoryId) => {
      const story = getStory(id), state = liveState();
      if (!ownerAlive() || !archiveOpen.value || currentStory.value || !story || !state || !isStoryUnlocked(story, profile.value.clearedStages)) return;
      show(story, 'archive', state);
    },
    previous: () => { if (ownerAlive() && pageIndex.value > 0) pageIndex.value--; },
    next: () => { if (!ownerAlive() || !currentStory.value) return; if (pageIndex.value < currentStory.value.pages.length - 1) pageIndex.value++; else complete(); },
    skip: complete,
    dispose: () => { if (disposed) return; disposed = true; for (const { signal, abort } of ownerObservers.values()) signal.removeEventListener('abort', abort); ownerObservers.clear(); unsubscribeProfile(); unsubscribeScene(); unsubscribeBattle(); cancelOverlay(); effects.stop(); },
  }))!;
  tryAutomatic();
  return model;
}
export type StoryViewModel = ReturnType<typeof createStoryViewModel>;
