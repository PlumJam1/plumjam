import { describe, expect, it, vi } from 'vitest';
import { controlState } from '../src/ui/controlState';
import { canFocus, trapDialogFocus } from '../src/ui/dialogFocus';
import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';

describe('typed UI control state', () => {
  it('distinguishes ready, cooldown, shortage and phase without parsing translated reasons', () => {
    const battle = { status: 'active' as const, gold: 35 };
    expect(controlState({ battle, cost: 35 })).toMatchObject({ status: 'ready', disabled: false });
    expect(controlState({ battle, cost: 35, cooldown: .7 })).toMatchObject({ status: 'cooldown', statusLabel: '0.7초', disabled: true });
    expect(controlState({ battle, cost: 55 })).toMatchObject({ status: 'funds', reason: '자금 20 부족', statusLabel: '20원 부족' });
    expect(controlState({ battle: { ...battle, status: 'paused' }, cost: 55, cooldown: .7 }).status).toBe('paused');
    expect(controlState({ battle: { ...battle, status: 'won' }, cost: 35 }).status).toBe('ended');
    expect(controlState({ battle, cost: 35, empty: true }).status).toBe('empty');
    expect(controlState({ battle, cost: 35, unlocked: false }).status).toBe('locked');
    expect(controlState({ battle, cost: 35, equipped: false }).status).toBe('unequipped');
    expect(controlState({ battle, cost: 0, max: true }).status).toBe('max');
    expect(controlState({ battle: null, cost: 35 }).status).toBe('loading');
  });
  it('prunes removed page focus without relying on blur and preserves global readonly details and battle funds', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin({ events: new EventEmitter() } as unknown as Phaser.Scene);
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ runId: scope.id }); const initial = session.snapshot();
    context.bridge.emit('battle-snapshot', initial);
    const commands = vi.fn(); const off = context.bridge.subscribe('battle-command', commands);
    model.describeEconomy('hover', true); model.describeUnit(0, 'focus', true);
    expect(model.controlDetail.value?.name).toBe('1번 근접 회사원');
    model.setUnitPage(1); model.describeEconomy('hover', true);
    expect(model.controlDetail.value?.name).toBe('경제 투자');
    model.previewSkill('hello-world', 'focus', true);
    expect(model.controlDetail.value?.name).toBe('Hello World');
    context.bridge.emit('battle-page', { runId: scope.id + 1, page: 0 });
    expect(model.unitPage.value).toBe(1); expect(model.controlDetail.value?.name).toBe('Hello World');
    expect(commands).not.toHaveBeenCalled(); expect(session.snapshot()).toEqual(initial);
    off(); context.dispose();
  });
  it('shows changing full names/reasons on focus without commanding battle or spending', () => {
    const context = new AppContext(); const scene = { events: new EventEmitter() } as unknown as Phaser.Scene;
    const scope = context.lifetimes.begin(scene), model = createBattleViewModel(context, scope, false);
    const snapshot = new BattleSession({ runId: scope.id }).snapshot();
    const commands = vi.fn(); const off = context.bridge.subscribe('battle-command', commands);
    context.bridge.emit('battle-snapshot', snapshot);
    model.describeUnit(0, 'focus', true);
    expect(model.controlDetail.value).toMatchObject({ name: '1번 근접 회사원', key: '1', reason: '사용 가능' });
    model.previewSkill('hello-world', 'hover', true);
    expect(model.controlDetail.value).toMatchObject({ name: 'Hello World', status: 'ready' });
    context.bridge.emit('battle-snapshot', { ...snapshot, gold: 10, skillCooldowns: { ...snapshot.skillCooldowns, 'hello-world': 1.2 } });
    expect(model.controlDetail.value).toMatchObject({ status: 'cooldown', reason: '준비 1.2초' });
    model.previewSkill('hello-world', 'hover', false);
    expect(model.controlDetail.value).toMatchObject({ name: '1번 근접 회사원', status: 'funds' });
    expect(commands).not.toHaveBeenCalled();
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'paused' }); expect(model.controlDetail.value).toBeNull();
    scope.dispose(); model.describeUnit(0, 'focus', true); expect(model.controlDetail.value).toBeNull();
    off(); context.dispose();
  });
});

function focusFixture() {
  const document = { activeElement: null as unknown };
  let keydown: ((event: KeyboardEvent) => void) | null = null;
  const make = (disabled = false) => ({ isConnected: true, tabIndex: 0, matches: () => disabled, closest: () => null,
    getClientRects: () => [{}], focus: vi.fn(function (this: unknown) { document.activeElement = this; }) });
  const first = make(), primary = make(), last = make(), disabled = make(true);
  const root = { ownerDocument: document, querySelector: () => primary, querySelectorAll: () => [first, disabled, primary, last],
    addEventListener: (_: string, handler: (event: KeyboardEvent) => void) => { keydown = handler; },
    removeEventListener: vi.fn(() => { keydown = null; }), focus: vi.fn() };
  const key = (key: string, shiftKey = false, ctrlKey = false, altKey = false, metaKey = false) => { const event = { key, shiftKey, ctrlKey, altKey, metaKey, preventDefault: vi.fn() }; keydown?.(event as unknown as KeyboardEvent); return event; };
  return { document, root: root as unknown as HTMLElement, first, primary, last, disabled, key, remove: root.removeEventListener };
}
describe('dialog focus lifetime', () => {
  it('enters primary, cycles both Tab directions, excludes disabled, preserves game/system keys and stops at disposal', () => {
    const fixture = focusFixture(); const dispose = trapDialogFocus(fixture.root);
    expect(fixture.document.activeElement).toBe(fixture.primary);
    fixture.key('Tab'); expect(fixture.document.activeElement).toBe(fixture.last);
    fixture.key('Tab'); expect(fixture.document.activeElement).toBe(fixture.first);
    fixture.key('Tab', true); expect(fixture.document.activeElement).toBe(fixture.last);
    for (const key of ['Escape', 'q', 'r']) expect(fixture.key(key).preventDefault).not.toHaveBeenCalled();
    expect(fixture.key('Tab', false, true).preventDefault).not.toHaveBeenCalled();
    expect(fixture.key('Tab', false, false, true).preventDefault).not.toHaveBeenCalled();
    expect(fixture.key('Tab', false, false, false, true).preventDefault).not.toHaveBeenCalled();
    expect(canFocus(fixture.disabled as unknown as HTMLElement)).toBe(false);
    dispose(); dispose(); expect(fixture.remove).toHaveBeenCalledTimes(1);
    const target = fixture.document.activeElement; fixture.key('Tab'); expect(fixture.document.activeElement).toBe(target);
    fixture.first.isConnected = false; expect(canFocus(fixture.first as unknown as HTMLElement)).toBe(false);
  });
});
