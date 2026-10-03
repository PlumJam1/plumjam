import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';

const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
afterEach(() => vi.useRealTimers());

describe('BattleViewModel scoped MVVM', () => {
  it('previews focus and hover without casting, follows current positions, and clears across pause and disposal', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ runId: scope.id });
    const snapshot = session.snapshot();
    const commands = vi.fn(); const previews = vi.fn();
    scope.defer(context.bridge.subscribe('battle-command', commands));
    scope.defer(context.bridge.subscribe('battle-preview', previews));
    context.bridge.emit('battle-snapshot', snapshot);
    model.previewSkill('heal', 'focus', true);
    expect(model.preview.value).toMatchObject({ skill: 'heal', x: snapshot.hero.x, targetIds: [snapshot.hero.id] });
    model.previewSkill('sleep', 'hover', true);
    model.previewSkill('sleep', 'hover', false);
    expect(model.preview.value?.skill).toBe('heal');
    context.bridge.emit('battle-snapshot', { ...snapshot, hero: { ...snapshot.hero, x: 240 } });
    expect(model.preview.value?.x).toBe(240);
    expect(commands).not.toHaveBeenCalled();
    expect(model.battle.value?.gold).toBe(snapshot.gold);
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'paused' });
    expect(model.preview.value).toBeNull();
    expect(previews).toHaveBeenLastCalledWith({ runId: scope.id, skill: null });
    context.bridge.emit('battle-snapshot', snapshot);
    expect(model.preview.value).toBeNull();
    model.previewSkill('heal', 'focus', true);
    scope.dispose();
    expect(model.preview.value).toBeNull();
    expect(context.bridge.listenerCount).toBe(0);
    context.dispose();
  });

  it('shows actual level and buff skill values and remaining buff times', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const snapshot = new BattleSession({ runId: scope.id, levels: { hero: 5, melee: 1, ranged: 1, support: 1 } }).snapshot();
    context.bridge.emit('battle-snapshot', { ...snapshot, hero: { ...snapshot.hero, buffs: { combat: 6.2, speed: 3.1 } } });
    expect(model.skills.value.find(skill => skill.kind === 'hello-world')?.description).toContain('피해 156');
    expect(model.skills.value.find(skill => skill.kind === 'heal')?.description).toContain('회복 112');
    expect(model.skills.value.find(skill => skill.kind === 'sleep')?.description).toContain('반경 120');
    expect(model.heroBuffs.value).toEqual(['공격 +30% · 받는 피해 -25% 6.2초', '이동 +35% 3.1초']);
    context.bridge.emit('battle-snapshot', snapshot);
    expect(model.skills.value.find(skill => skill.kind === 'hello-world')?.description).toContain('피해 120');
    expect(model.heroBuffs.value).toEqual([]);
    context.dispose();
  });

  it('shows overclock ETA including expiry, excludes itself, and leaves locked push inspectable', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const snapshot = new BattleSession({ runId: scope.id }).snapshot();
    context.bridge.emit('battle-snapshot', { ...snapshot, overclockRemaining: 3, skillCooldowns: { ...snapshot.skillCooldowns, sleep: 10, overclock: 30 }, summonCooldowns: { ...snapshot.summonCooldowns, ranged: 5 } });
    expect(model.units.value.find(unit => unit.kind === 'ranged')?.reason).toBe('준비 2.5초');
    expect(model.skills.value.find(skill => skill.kind === 'sleep')).toMatchObject({ reason: '준비 7.0초', progress: 0 });
    expect(model.skills.value.find(skill => skill.kind === 'overclock')?.reason).toBe('준비 30.0초');
    expect(model.skills.value.find(skill => skill.kind === 'git-push')).toMatchObject({ disabled: true, unlocked: false, reason: '상점에서 해금' });
    model.previewSkill('git-push', 'focus', true);
    expect(model.preview.value?.skill).toBe('git-push');
    expect(model.heroBuffs.value).toContain('overclock 소환·스킬 쿨타임 50% 3.0초');
    context.bridge.emit('battle-snapshot', { ...snapshot, unlockedSkills: [...snapshot.unlockedSkills, 'git-push'] });
    expect(model.skills.value.find(skill => skill.kind === 'git-push')?.disabled).toBe(false);
    context.dispose();
  });

  it('shows boss HP, winding attack, wave warnings and expires the defeat notice even after a win', () => {
    vi.useFakeTimers();
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ runId: scope.id, stage: { id: '1-5', label: 'boss', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400, spawns: [{ at: 0, kind: 'gpt-4o' }] } });
    session.step(.01);
    const snapshot = session.snapshot(); const unit = snapshot.units[0]!;
    context.bridge.emit('battle-snapshot', { ...snapshot, units: [{ ...unit, hp: 750 }], bossTelegraphs: [{ ownerId: unit.id, x: 300, radius: 80, remaining: .6, duration: 1.4 }] });
    expect(model.boss.value).toMatchObject({ hp: 750, maxHp: 1500, percent: 50, attack: '전방 범위 공격 0.6초' });
    context.bridge.emit('battle-snapshot', { ...snapshot, elapsed: 14 });
    expect(model.waveNotice.value).toContain('보스 지원군');
    context.bridge.emit('battle-snapshot', { ...snapshot, elapsed: 18 });
    expect(model.waveNotice.value).toBe('');
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'won', units: [], defeatedBossCount: 1 });
    expect(model.boss.value).toBeNull();
    expect(model.bossNotice.value).toBe('GPT-4o 격파!');
    vi.advanceTimersByTime(3000);
    expect(model.bossNotice.value).toBe('');
    context.bridge.emit('battle-snapshot', { ...snapshot, defeatedBossCount: 2 });
    scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
    context.dispose();
  });

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
    expect(model.skills.value).toHaveLength(5);
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
