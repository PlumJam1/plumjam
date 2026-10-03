import { describe, expect, it, vi } from 'vitest';
import { installDeveloperShortcut, type DeveloperShortcutTarget } from '../src/ui/developerShortcut';

function fixture() {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const target: DeveloperShortcutTarget = {
    addEventListener: vi.fn((_type, listener, _capture) => { listeners.add(listener); }),
    removeEventListener: vi.fn((_type, listener, _capture) => { listeners.delete(listener); }),
  };
  const toggle = vi.fn();
  const cleanup = installDeveloperShortcut(target, toggle);
  const event = (overrides: Partial<KeyboardEvent> = {}) => {
    const value = {
      code: 'KeyO', key: 'o', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, repeat: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(), ...overrides,
    } as unknown as KeyboardEvent;
    return value;
  };
  const dispatch = (value: KeyboardEvent) => { for (const listener of [...listeners]) listener(value); };
  return { target, toggle, cleanup, listeners, event, dispatch };
}

describe('global developer shortcut', () => {
  it('captures Ctrl+O before modal/game handlers and blocks native Open before toggling once', () => {
    const f = fixture(); const event = f.event();
    f.toggle.mockImplementation(() => {
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
    });
    f.dispatch(event);
    expect(f.target.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(f.toggle).toHaveBeenCalledOnce();
  });

  it('continues blocking a held matching key without repeated toggles', () => {
    const f = fixture(); f.dispatch(f.event());
    for (let index = 0; index < 3; index++) {
      const repeated = f.event({ repeat: true }); f.dispatch(repeated);
      expect(repeated.preventDefault).toHaveBeenCalledOnce();
      expect(repeated.stopPropagation).toHaveBeenCalledOnce();
    }
    expect(f.toggle).toHaveBeenCalledOnce();
  });

  it.each([
    { ctrlKey: false }, // Plain O remains the overclock key.
    { shiftKey: true }, { altKey: true }, { metaKey: true },
    { ctrlKey: false, metaKey: true }, // Cmd+O is untouched.
    { code: 'KeyP', key: 'p' }, { code: 'KeyP', key: 'o' },
    { code: 'Digit0', key: '0' }, { code: '', key: 'p' },
  ])('leaves other browser/game combinations untouched: %j', overrides => {
    const f = fixture(); const event = f.event(overrides); f.dispatch(event);
    expect(f.toggle).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it.each([{ code: 'KeyO', key: 'ㅐ' }, { code: '', key: 'o' }, { code: 'Unidentified', key: 'O' }])(
    'supports the physical key and missing-code fallback: %j', overrides => {
      const f = fixture(); const event = f.event(overrides); f.dispatch(event);
      expect(f.toggle).toHaveBeenCalledOnce(); expect(event.preventDefault).toHaveBeenCalledOnce();
    },
  );

  it('works globally even when a modal or editable descendant is the event target', () => {
    const f = fixture(); f.dispatch(f.event({ target: { tagName: 'INPUT' } as unknown as EventTarget }));
    expect(f.toggle).toHaveBeenCalledOnce();
  });

  it('removes the exact capture listener once and remains inert after cleanup/reinstallation', () => {
    const f = fixture(); const oldListener = [...f.listeners][0]!;
    f.cleanup(); f.cleanup();
    expect(f.target.removeEventListener).toHaveBeenCalledExactlyOnceWith('keydown', oldListener, true);
    expect(f.listeners.size).toBe(0);
    const detached = f.event(); oldListener(detached); f.dispatch(detached);
    expect(f.toggle).not.toHaveBeenCalled(); expect(detached.preventDefault).not.toHaveBeenCalled();
    const nextToggle = vi.fn(); const disposeNext = installDeveloperShortcut(f.target, nextToggle);
    expect(f.listeners.size).toBe(1); f.dispatch(f.event());
    expect(nextToggle).toHaveBeenCalledOnce(); expect(f.toggle).not.toHaveBeenCalled();
    disposeNext(); expect(f.listeners.size).toBe(0);
  });
});
