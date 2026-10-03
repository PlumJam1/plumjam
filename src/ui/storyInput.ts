export type StoryKeyAction = 'next' | 'previous' | 'skip' | 'close' | 'suppress' | null;
/** Native button Enter must remain one click; all navigation is explicit, never timed. */
export function storyKeyAction(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'altKey' | 'metaKey'>, playing: boolean, buttonTarget: boolean): StoryKeyAction {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.repeat) return event.key === 'Enter' || event.key === ' ' && buttonTarget ? 'suppress' : null;
  if (event.key === 'Escape') return playing ? 'skip' : 'close';
  if (!playing) return null;
  if (event.key === 'ArrowLeft') return 'previous';
  if (event.key === 'ArrowRight') return 'next';
  if (event.key === 'Enter' && !buttonTarget) return 'next';
  return null;
}

export function handleStoryKey(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'altKey' | 'metaKey' | 'preventDefault'>, playing: boolean, buttonTarget: boolean): StoryKeyAction {
  const action = storyKeyAction(event, playing, buttonTarget);
  if (action) event.preventDefault();
  return action;
}
