import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import type { SkillKind } from '../src/game/battle/types';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';
const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;

function fixture(equippedSkills: SkillKind[]) {
  const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
  context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
  const model = createBattleViewModel(context, scope, false);
  const session = new BattleSession({ runId: scope.id, unlockedSkills: ['hello-world', 'sleep', 'heal', 'git-push'], equippedSkills });
  const commands = vi.fn();
  scope.defer(context.bridge.subscribe('battle-command', event => { commands(event); session.dispatch(event.command); context.bridge.emit('battle-snapshot', session.snapshot()); }));
  context.bridge.emit('battle-snapshot', session.snapshot());
  return { context, scope, model, session, commands };
}

describe('primary equipped spell shares the ordinary skill entry and fixed key', () => {
  it.each([
    { equipped: ['sleep'], first: 'sleep', key: 'K' },
    { equipped: ['heal', 'hello-world'], first: 'heal', key: 'L' },
    { equipped: ['git-push', 'sleep'], first: 'git-push', key: 'P' },
  ] as { equipped: SkillKind[]; first: SkillKind; key: string }[])('uses $first from captured order without a free cast on hover or focus', ({ equipped, first, key }) => {
    const { context, model, session, commands } = fixture(equipped);
    const before = session.snapshot();
    expect(model.primarySkill.value).toBe(model.skills.value[0]);
    expect(model.primarySkill.value).toMatchObject({ kind: first, key });
    model.previewSkill(first, 'hover', true); model.previewSkill(first, 'focus', true);
    model.previewSkill(first, 'hover', false);
    expect(model.preview.value).not.toBeNull(); expect(model.controlDetail.value?.name).toBe(model.primarySkill.value!.label);
    expect(session.snapshot()).toEqual(before); expect(commands).not.toHaveBeenCalled();
    model.previewSkill(first, 'focus', false); expect(model.preview.value).toBeNull(); expect(model.controlDetail.value).toBeNull();
    model.useSkill(model.primarySkill.value!.kind);
    expect(commands).toHaveBeenCalledTimes(1);
    expect(commands).toHaveBeenLastCalledWith({ runId: before.runId, command: { type: 'skill', skill: first } });
    expect(model.primarySkill.value).toBe(model.skills.value[0]);
    expect(model.primarySkill.value!.cooldown).toBeGreaterThan(0);
    expect(session.snapshot().gold).toBe(before.gold - model.primarySkill.value!.cost);
    model.useSkill(first); expect(commands).toHaveBeenCalledTimes(1);
    context.dispose();
  });

  it('keeps an empty loadout empty and rejects unavailable, paused, ended, stale and disposed paid actions', () => {
    const { context, scope, model, session, commands } = fixture([]);
    expect(model.primarySkill.value).toBeNull(); expect(model.skillSlots.value).toEqual([null, null, null]);
    model.useSkill('hello-world'); expect(commands).not.toHaveBeenCalled();
    const captured = new BattleSession({ runId: scope.id, unlockedSkills: ['heal'], equippedSkills: ['heal'] }).snapshot();
    for (const state of [{ ...captured, gold: 0 }, { ...captured, status: 'paused' as const }, { ...captured, status: 'won' as const }]) {
      context.bridge.emit('battle-snapshot', state); model.useSkill('heal'); expect(commands).not.toHaveBeenCalled();
    }
    context.bridge.emit('battle-snapshot', captured);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id + 1, phase: 'ready' });
    model.useSkill('heal'); expect(commands).not.toHaveBeenCalled();
    model.previewSkill('heal', 'focus', true); expect(model.preview.value).toBeNull();
    scope.dispose(); model.useSkill('heal'); expect(commands).not.toHaveBeenCalled();
    expect(session.snapshot().equippedSkills).toEqual([]);
    context.dispose();
  });
});

describe('boss assist metadata distinguishes selected and effective speed', () => {
  it('offers free active/paused changes, keeps the selected button state and blocks stale/ended controls', () => {
    const { context, scope, model, session, commands } = fixture(['sleep']);
    const selected = { ...session.snapshot(), speed: 3 as const, effectiveSpeed: 1 as const, bossAssistEnabled: true, bossAssistActive: true };
    context.bridge.emit('battle-snapshot', selected);
    expect(model.speed.value).toBe(3); expect(model.effectiveSpeed.value).toBe(1);
    expect(model.bossAssistLabel.value).toBe('예고 보호 1배 · 선택 3배');
    expect(model.speedSummary.value).toBe('선택 3배 · 현재 1배');
    const active = session.snapshot(); model.setBossAssist(false);
    expect(model.bossAssistEnabled.value).toBe(false); expect(session.snapshot().gold).toBe(active.gold);
    model.setBossAssist(true);
    session.setPaused(true); context.bridge.emit('battle-snapshot', session.snapshot());
    const before = session.snapshot(); model.toggleBossAssist();
    expect(commands).toHaveBeenLastCalledWith({ runId: scope.id, command: { type: 'set-boss-assist', enabled: false } });
    const after = session.snapshot(); expect(after.gold).toBe(before.gold); expect(after.elapsed).toBe(before.elapsed);
    expect(after.skillCooldowns).toEqual(before.skillCooldowns); expect(model.bossAssistEnabled.value).toBe(false);
    model.setBossAssist(true); expect(model.bossAssistEnabled.value).toBe(true);
    const count = commands.mock.calls.length;
    context.bridge.emit('battle-snapshot', { ...after, status: 'lost' }); model.setBossAssist(false); expect(commands).toHaveBeenCalledTimes(count);
    context.bridge.emit('battle-snapshot', after);
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id + 1, phase: 'ready' }); model.toggleBossAssist(); expect(commands).toHaveBeenCalledTimes(count);
    scope.dispose(); model.setBossAssist(false); expect(commands).toHaveBeenCalledTimes(count);
    expect(new BattleSession({ runId: scope.id + 1 }).snapshot().bossAssistEnabled).toBe(true);
    context.dispose();
  });
});
