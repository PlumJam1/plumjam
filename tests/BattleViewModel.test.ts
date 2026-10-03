import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';

const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
afterEach(() => vi.useRealTimers());

describe('BattleViewModel scoped MVVM', () => {
  it('shows a moving Hello estimate without commands or spending and discards it at pause, end and restart', () => {
    const context = new AppContext(); const scene = fakeScene(); const scope = context.lifetimes.begin(scene);
    const model = createBattleViewModel(context, scope, false);
    const snapshot = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id }).snapshot();
    const commands = vi.fn(); const previews = vi.fn();
    const unsubscribe = context.bridge.subscribe('battle-command', commands);
    const offPreview = context.bridge.subscribe('battle-preview', previews);
    context.bridge.emit('battle-snapshot', snapshot);
    model.previewSkill('hello-world', 'hover', true);
    expect(model.previewTargets.value).toBe('현재 예상 대상: 없음 · 이동 중 달라질 수 있음');
    model.previewSkill('hello-world', 'hover', false);
    expect(model.preview.value).toBeNull();
    model.previewSkill('hello-world', 'focus', true);
    context.bridge.emit('battle-snapshot', { ...snapshot, hero: { ...snapshot.hero, x: 250 } });
    expect(model.preview.value).toMatchObject({ x: 250, targetIds: [snapshot.aiBase.id] });
    expect(model.previewTargets.value).toBe('현재 예상 대상: 적 기지 · 이동 중 달라질 수 있음');
    expect(commands).not.toHaveBeenCalled();
    expect(model.battle.value).toMatchObject({ gold: snapshot.gold, projectiles: [], skillCooldowns: snapshot.skillCooldowns });
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'paused' });
    expect(model.preview.value).toBeNull(); expect(model.previewTargets.value).toBe('');
    context.bridge.emit('battle-snapshot', snapshot);
    expect(model.preview.value).toBeNull();
    model.previewSkill('hello-world', 'focus', true);
    context.bridge.emit('battle-snapshot', { ...snapshot, status: 'won' });
    expect(model.preview.value).toBeNull();
    context.bridge.emit('battle-snapshot', snapshot);
    model.previewSkill('hello-world', 'focus', true);
    scene.events.emit('shutdown');
    expect(model.preview.value).toBeNull();
    expect(previews).toHaveBeenLastCalledWith({ runId: scope.id, skill: null });
    model.previewSkill('hello-world', 'focus', true);
    const nextScope = context.lifetimes.begin(scene); const next = createBattleViewModel(context, nextScope, false);
    context.bridge.emit('battle-snapshot', new BattleSession({ runId: nextScope.id }).snapshot());
    expect(next.preview.value).toBeNull(); expect(commands).not.toHaveBeenCalled();
    unsubscribe(); offPreview(); context.dispose();
    expect(context.bridge.listenerCount).toBe(0);
  });

  it('previews focus and hover without casting, follows current positions, and clears across pause and disposal', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id });
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
    const snapshot = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id, levels: { hero: 5, melee: 1, ranged: 1, support: 1 } }).snapshot();
    context.bridge.emit('battle-snapshot', { ...snapshot, hero: { ...snapshot.hero, buffs: { combat: 6.2, speed: 3.1, haste: 0 } } });
    expect(model.skills.value.find(skill => skill.kind === 'hello-world')?.description).toContain('피해 144');
    expect(model.skills.value.find(skill => skill.kind === 'heal')?.description).toContain('회복 112');
    expect(model.skills.value.find(skill => skill.kind === 'sleep')?.description).toContain('반경 120');
    expect(model.heroBuffs.value).toEqual(['공격 +20% · 받는 피해 -15% 6.2초', '이동 +35% 3.1초']);
    context.bridge.emit('battle-snapshot', snapshot);
    expect(model.skills.value.find(skill => skill.kind === 'hello-world')?.description).toContain('피해 120');
    expect(model.heroBuffs.value).toEqual([]);
    context.dispose();
  });

  it('shows overclock ETA including expiry, excludes itself, and leaves locked push inspectable', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const snapshot = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'overclock'], equippedSkills: ['hello-world', 'sleep', 'overclock'], runId: scope.id }).snapshot();
    context.bridge.emit('battle-snapshot', { ...snapshot, overclockRemaining: 3, skillCooldowns: { ...snapshot.skillCooldowns, sleep: 10, overclock: 30 }, summonCooldowns: { ...snapshot.summonCooldowns, ranged: 5 } });
    expect(model.units.value.find(unit => unit.kind === 'ranged')?.reason).toBe('준비 2.5초');
    expect(model.skills.value.find(skill => skill.kind === 'sleep')).toMatchObject({ reason: '준비 7.0초', progress: 0 });
    expect(model.skills.value.find(skill => skill.kind === 'overclock')?.reason).toBe('준비 30.0초');
    expect(model.allSkills.value.find(skill => skill.kind === 'git-push')).toMatchObject({ disabled: true, unlocked: false, reason: '상점에서 구매' });
    model.previewSkill('git-push', 'focus', true);
    expect(model.preview.value).toBeNull();
    expect(model.heroBuffs.value).toContain('overclock 소환·스킬 쿨타임 50% 3.0초');
    context.bridge.emit('battle-snapshot', { ...snapshot, unlockedSkills: [...snapshot.unlockedSkills, 'git-push'], equippedSkills: ['hello-world', 'git-push', 'overclock'] });
    expect(model.allSkills.value.find(skill => skill.kind === 'git-push')?.disabled).toBe(false);
    context.dispose();
  });

  it('shows boss HP, winding attack, wave warnings and expires the defeat notice even after a win', () => {
    vi.useFakeTimers();
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id, stage: { id: '1-5', label: 'boss', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400, spawns: [{ at: 0, kind: 'gpt-4o' }] } });
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

  it('continues after 1-5 and completes only at the last catalog stage', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id });
    context.bridge.emit('battle-result', { runId: scope.id + 1, stageId: '1-5', reward: 360, prototypeComplete: true });
    expect(model.reward.value).toBe(0);
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '1-1', reward: 120, prototypeComplete: false });
    context.bridge.emit('battle-snapshot', { ...session.snapshot(), status: 'won' });
    expect(model.reward.value).toBe(120); expect(model.hasNextStage.value).toBe(true);
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '1-5', reward: 360, prototypeComplete: true });
    context.bridge.emit('battle-snapshot', { ...session.snapshot(), stageId: '1-5', status: 'won' });
    expect(model.hasNextStage.value).toBe(true);
    expect(model.prototypeComplete.value).toBe(false); // Stale 1-5 completion metadata cannot end chapter two.
    expect(model.resultDescription.value).not.toContain('모두 클리어');
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '2-5', reward: 650, prototypeComplete: true });
    context.bridge.emit('battle-snapshot', { ...session.snapshot(), stageId: '2-5', status: 'won' });
    expect(model.hasNextStage.value).toBe(false);
    expect(model.prototypeComplete.value).toBe(true);
    expect(model.resultDescription.value).toContain('2개 챕터 · 10개 스테이지');
    context.dispose();
  });
  it('derives costs/cooldown/reasons and sends click commands through the same run-scoped bridge', () => {
    const context = new AppContext();
    const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, true);
    const session = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id });
    scope.defer(context.bridge.subscribe('battle-command', ({ command, runId }) => {
      expect(runId).toBe(scope.id);
      session.dispatch(command);
      context.bridge.emit('battle-snapshot', session.snapshot());
    }));
    context.bridge.emit('battle-snapshot', session.snapshot());
    expect(model.units.value).toHaveLength(10);
    expect(model.skills.value).toHaveLength(3);
    expect(model.skillSlots.value).toHaveLength(3);
    model.useSkill('heal');
    expect(model.skills.value.find((skill) => skill.kind === 'heal')).toMatchObject({ disabled: true, reason: '준비 12.0초' });
    expect(model.units.value.find((unit) => unit.kind === 'ranged')?.reason).toBe('자금 10 부족');
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
    const current = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id }).snapshot();
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


describe('ten summon slot presentation', () => {
  it('keeps empty slots and keys stable, and renders captured levels and first-clear allies', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ unlockedSkills: ['hello-world', 'sleep', 'heal'], equippedSkills: ['hello-world', 'sleep', 'heal'], runId: scope.id, levels: { hero: 1, melee: 5, ranged: 1, support: 1 }, equippedAllies: ['ranged', null, 'melee', null, null] });
    context.bridge.emit('battle-snapshot', session.snapshot());
    expect(model.visibleUnits.value.map(unit => [unit.key, unit.kind])).toEqual([['1', 'ranged'], ['2', null], ['3', 'melee'], ['4', null], ['5', null]]);
    expect(model.units.value[1]).toMatchObject({ disabled: true, reason: '준비실에서 편성' });
    expect(model.units.value[2].level).toBe(5);
    const commands = vi.fn(); const off = context.bridge.subscribe('battle-command', commands);
    model.summon(null); expect(commands).not.toHaveBeenCalled();
    model.summon('melee'); expect(commands).toHaveBeenCalledWith({ runId: scope.id, command: { type: 'summon', kind: 'melee' } });
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '1-1', reward: 120, prototypeComplete: false, firstClear: true, newlyUnlockedAllies: ['technician'] });
    expect(model.newAllies.value).toEqual([{ kind: 'technician', label: '기술직' }]);
    off(); context.dispose();
  });
});


describe('three skill slots and battle speed presentation', () => {
  it('shows only captured equipped skills with fixed keys and disables the separate Hello when removed', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const fresh = new BattleSession({ runId: scope.id }).snapshot();
    context.bridge.emit('battle-snapshot', fresh);
    expect(model.skills.value.map(skill => skill.kind)).toEqual(['hello-world']);
    expect(model.skillSlots.value.map(skill => skill?.kind ?? null)).toEqual(['hello-world', null, null]);
    context.bridge.emit('battle-snapshot', { ...fresh, unlockedSkills: ['hello-world', 'sleep', 'git-push', 'overclock'], equippedSkills: ['overclock', 'sleep', 'git-push'] });
    expect(model.skills.value.map(skill => [skill.kind, skill.key])).toEqual([['overclock', 'O'], ['sleep', 'K'], ['git-push', 'P']]);
    expect(model.allSkills.value.find(skill => skill.kind === 'hello-world')).toMatchObject({ disabled: true, reason: '장착 필요' });
    model.previewSkill('hello-world', 'focus', true); expect(model.preview.value).toBeNull();
    context.bridge.emit('battle-snapshot', { ...fresh, equippedSkills: [] });
    expect(model.skills.value).toEqual([]); expect(model.skillSlots.value).toEqual([null, null, null]);
    context.dispose();
  });
  it('sends speed changes while active or paused but blocks ended, disposed and stale runs', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    const model = createBattleViewModel(context, scope, false); const session = new BattleSession({ runId: scope.id });
    const commands = vi.fn(); const off = context.bridge.subscribe('battle-command', value => { commands(value); session.dispatch(value.command); context.bridge.emit('battle-snapshot', session.snapshot()); });
    model.setSpeed(2); expect(commands).not.toHaveBeenCalled();
    context.bridge.emit('battle-snapshot', session.snapshot()); expect(model.speed.value).toBe(1);
    model.setSpeed(3); expect(model.speed.value).toBe(3); expect(commands).toHaveBeenLastCalledWith({ runId: scope.id, command: { type: 'set-speed', speed: 3 } });
    session.setPaused(true); context.bridge.emit('battle-snapshot', session.snapshot());
    const before = model.battle.value!.elapsed; model.setSpeed(2); session.step(1); context.bridge.emit('battle-snapshot', session.snapshot());
    expect(model.speed.value).toBe(2); expect(model.battle.value!.elapsed).toBe(before);
    const count = commands.mock.calls.length;
    context.bridge.emit('battle-snapshot', { ...session.snapshot(), status: 'won' }); model.setSpeed(1);
    expect(model.speedDisabled.value).toBe(true); expect(commands).toHaveBeenCalledTimes(count);
    context.bridge.emit('battle-snapshot', session.snapshot());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id + 1, phase: 'ready' }); model.setSpeed(1); expect(commands).toHaveBeenCalledTimes(count);
    scope.dispose(); model.setSpeed(1); expect(commands).toHaveBeenCalledTimes(count);
    const next = new BattleSession({ runId: scope.id + 1 }); expect(next.snapshot().speed).toBe(1);
    off(); context.dispose();
  });
});


describe('scoped five-card summon paging', () => {
  it('switches only presentation, keeps shared gold/cooldowns and maps local 1–5 keys onto the selected five', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ runId: scope.id, equippedAllies: ['melee', null, null, null, null, 'ranged', null, null, null, 'support'] });
    session.dispatch({ type: 'summon', kind: 'ranged' });
    const before = session.snapshot(); const commands = vi.fn(); const off = context.bridge.subscribe('battle-command', commands);
    context.bridge.emit('battle-snapshot', before);
    expect(model.unitPage.value).toBe(0); expect(model.visibleUnits.value[0].kind).toBe('melee');
    model.setUnitPage(1);
    expect(model.unitPage.value).toBe(1);
    expect(model.visibleUnits.value.map(unit => [unit.key, unit.kind])).toEqual([['1', 'ranged'], ['2', null], ['3', null], ['4', null], ['5', 'support']]);
    expect(model.visibleUnits.value[0]).toMatchObject({ slotIndex: 5, disabled: true, reason: '준비 5.0초' });
    expect(session.snapshot()).toEqual(before); expect(commands).not.toHaveBeenCalled();
    context.bridge.emit('battle-snapshot', { ...before, status: 'paused' }); model.setUnitPage(0); expect(model.unitPage.value).toBe(0);
    context.bridge.emit('battle-page', { runId: scope.id + 1, page: 1 }); expect(model.unitPage.value).toBe(0);
    context.bridge.emit('battle-snapshot', { ...before, status: 'won' }); model.setUnitPage(1); expect(model.unitPage.value).toBe(0); expect(model.pageDisabled.value).toBe(true);
    context.bridge.emit('battle-snapshot', before); context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id + 1, phase: 'ready' }); model.setUnitPage(1); expect(model.unitPage.value).toBe(0);
    scope.dispose(); model.setUnitPage(1); expect(model.unitPage.value).toBe(0);
    const nextScope = context.lifetimes.begin(fakeScene()); const next = createBattleViewModel(context, nextScope, false);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: nextScope.id, phase: 'ready' });
    context.bridge.emit('battle-snapshot', new BattleSession({ runId: nextScope.id }).snapshot());
    expect(next.unitPage.value).toBe(0); expect(next.visibleUnits.value).toHaveLength(5);
    off(); context.dispose();
  });
});


describe('foreach equipped skill display', () => {
  it('shares captured hero-level damage and fixed I key with only the equipped catalogue', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ runId: scope.id, levels: { hero: 5 }, unlockedSkills: ['hello-world', 'foreach'], equippedSkills: ['foreach'] });
    context.bridge.emit('battle-snapshot', session.snapshot());
    expect(model.skills.value[0]).toMatchObject({ kind: 'foreach', key: 'I', cost: 100, effectLabel: '광역 피해 152' });
    expect(model.skills.value[0].description).toContain('피해 152 · 전방 180 · 반경 90 · 0.7초 뒤 착지');
    const hero = session.snapshot().hero;
    context.bridge.emit('battle-snapshot', { ...session.snapshot(), hero: { ...hero, buffs: { ...hero.buffs, combat: 7 } } });
    expect(model.skills.value[0].effectLabel).toBe('광역 피해 182.4');
    context.dispose();
  });
});


describe('chapter two boss HUD', () => {
  it('shows alive boss HP totals and removes dead owners from the aggregate', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false);
    const session = new BattleSession({ runId: scope.id, stage: { id: '2-5', label: 'double boss', humanBaseHp: 900, aiBaseHp: 3400, initialGold: 340, spawns: [{ at: 0, kind: 'gpt-4o' }, { at: 0, kind: 'gpt-4o' }] } });
    const snapshot = session.snapshot(); const [first, second] = snapshot.units;
    context.bridge.emit('battle-snapshot', { ...snapshot, units: [{ ...first, hp: 600 }, { ...second, hp: 900 }] });
    expect(model.boss.value).toMatchObject({ count: 2, label: 'GPT-4o ×2', hp: 1500, maxHp: 3000, percent: 50 });
    context.bridge.emit('battle-snapshot', { ...snapshot, units: [{ ...first, hp: 0 }, { ...second, hp: 900 }], defeatedBossCount: 1 });
    expect(model.boss.value).toMatchObject({ count: 1, label: 'GPT-4o', hp: 900, maxHp: 1500, percent: 60 });
    scope.dispose(); context.dispose();
  });
});
