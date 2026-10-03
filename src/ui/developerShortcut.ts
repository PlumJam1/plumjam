/** Window-compatible target so registration/cleanup can be tested without a browser. */
export interface DeveloperShortcutTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void, capture: boolean): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void, capture: boolean): void;
}

export function installDeveloperShortcut(target: DeveloperShortcutTarget, onToggle: () => void): () => void {
  let disposed = false;
  const keydown = (event: KeyboardEvent) => {
    if (disposed || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    // Prefer the physical key, including non-Latin layouts. Fall back only when code is unavailable.
    const isO = event.code === 'KeyO'
      || (!event.code || event.code === 'Unidentified') && event.key.toLowerCase() === 'o';
    if (!isO) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) onToggle();
  };
  target.addEventListener('keydown', keydown, true);
  return () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('keydown', keydown, true);
  };
}
