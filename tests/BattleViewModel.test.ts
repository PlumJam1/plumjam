import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';

const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
afterEach(() => vi.useRealTimers());

describe('BattleViewModel scoped MVVM', () => {
  it('shows per-run rewards and the final completion without inventing a sixth stage', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ runId: scope.id });
    context.bridge.emit('battle-result', { runId: scope.id + 1, stageId: '1-5', reward: 360, prototypeComplete: true });
    expect(model.reward.value).toBe(0);
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '1-1', reward: 120, prototypeComplete: false });
    context.bridge.emit('battle-snapshot', { ...session.snapshot(), status: 'won' });
    expect(model.reward.value).toBe(120); expect(model.hasNextStage.value).toBe(true);
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '1-5', reward: 360, prototypeComplete: true });
    context.bridge.emit('battle-snapshot', { ...session.snapshot(), stageId: '1-5', status: 'won' });
    expect(model.hasNextStage.value).toBe(false);
    expect(model.resultDescription.value).toContain('5개 스테이지');
    context.dispose();
  });
  it('derives costs/cooldown/reasons and sends click commands through the same run-scoped bridge', () => {
    const context = new AppContext();
    const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, true);
    const session = new BattleSession({ runId: scope.id });
    scope.defer(context.bridge.subscribe('battle-command', ({ command, runId }) => {
      expect(runId).toBe(scope.id);
      session.dispatch(command);
      context.bridge.emit('battle-snapshot', session.snapshot());
    }));
    context.bridge.emit('battle-snapshot', session.snapshot());
    expect(model.units.value).toHaveLength(3);
    expect(model.skills.value).toHaveLength(3);
    model.useSkill('heal');
    expect(model.skills.value.find((skill) => skill.kind === 'heal')).toMatchObject({ disabled: true, reason: '준비 12.0초' });
    expect(model.units.value.find((unit) => unit.kind === 'ranged')?.reason).toBe('자금 20 부족');
    expect(model.economyDescription.value).toBe('수입 +26/초 · 상한 650');
    model.dismissIntro();
    expect(model.intro.value).toBe(false);
    context.dispose();
  });

  it('preserves a funds notice across movement and reasonless successes until its original expiry', () => {
    vi.useFakeTimers();
    const context = new AppContext();
    const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const commands = vi.fn();
    scope.defer(context.bridge.subscribe('battle-command', commands));
    context.bridge.emit('battle-feedback', { runId: scope.id, result: { accepted: false, reason: 'sleep()에 쓸 자금이 부족해.' } });
    vi.advanceTimersByTime(1000);
    model.move(1); model.move(0); model.move(-1); model.move(0);
    expect(commands).toHaveBeenCalledTimes(4);
    // A benign success from another action must also leave the notice and its expiry intact.
    context.bridge.emit('battle-feedback', { runId: scope.id, result: { accepted: true } });
    vi.advanceTimersByTime(1599);
    expect(model.feedback.value).toBe('sleep()에 쓸 자금이 부족해.');
    vi.advanceTimersByTime(1);
    expect(model.feedback.value).toBe('');
    context.dispose();
  });

  it('ignores old-run snapshots and releases transient message timers and subscriptions at shutdown', () => {
    vi.useFakeTimers();
    const context = new AppContext();
    const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const current = new BattleSession({ runId: scope.id }).snapshot();
    context.bridge.emit('battle-snapshot', { ...current, runId: scope.id + 1 });
    expect(model.battle.value).toBeNull();
    context.bridge.emit('battle-snapshot', current);
    context.bridge.emit('battle-feedback', { runId: scope.id, result: { accepted: false, reason: '자금 부족' } });
    expect(model.feedback.value).toBe('자금 부족');
    vi.advanceTimersByTime(2601);
    expect(model.feedback.value).toBe('');
    context.bridge.emit('battle-feedback', { runId: scope.id, result: { accepted: false, reason: '준비 중' } });
    scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(context.bridge.listenerCount).toBe(0);
    context.bridge.emit('battle-snapshot', { ...current, gold: 0 });
    expect(model.battle.value?.gold).toBe(180);
    context.dispose();
  });
});
