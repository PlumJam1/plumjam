const focusableSelector = 'button, [href], input, select, textarea, [tabindex]';
export function canFocus(element: HTMLElement | null): element is HTMLElement {
  return !!element && element.isConnected && !element.matches(':disabled') && !element.closest('[inert], [hidden]') && element.getClientRects().length > 0;
}
export function dialogTargets(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => element.tabIndex >= 0 && canFocus(element));
}
/** A local listener traps only Tab, leaving game Escape/Q/R handlers unchanged. */
export function trapDialogFocus(root: HTMLElement): () => void {
  let disposed = false;
  const keydown = (event: KeyboardEvent) => {
    if (disposed || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const targets = dialogTargets(root);
    event.preventDefault();
    if (!targets.length) { root.focus(); return; }
    const index = targets.indexOf(root.ownerDocument.activeElement as HTMLElement);
    const next = index < 0 ? event.shiftKey ? targets.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
    targets[next].focus();
  };
  root.addEventListener('keydown', keydown);
  const primary = root.querySelector<HTMLElement>('[data-dialog-primary]');
  (canFocus(primary) ? primary : dialogTargets(root)[0] ?? root).focus();
  return () => { if (!disposed) { disposed = true; root.removeEventListener('keydown', keydown); } };
}
