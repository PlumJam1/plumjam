import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { SKILL_KEYS } from '../src/game/battle/balance';
import type { BattleSnapshot, SkillKind } from '../src/game/battle/types';
import { acknowledgeTutorialStep, initialTutorialProgress, observeTutorial, tutorialStep } from '../src/ui/tutorialProgress';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';

const scene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
function fixture(skills: SkillKind[] = ['hello-world'], showIntro = true) {
  const context = new AppContext(); const scope = context.lifetimes.begin(scene());
  context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
  const model = createBattleViewModel(context, scope, showIntro);
  const session = new BattleSession({ runId: scope.id, unlockedSkills: skills, equippedSkills: skills,
    stage: { id: 'tutorial-test', label: 'Tutorial', initialGold: 400, humanBaseHp: 900, aiBaseHp: 900, spawns: [] } });
  const snapshot = session.snapshot(); context.bridge.emit('battle-snapshot', snapshot);
  return { context, scope, model, session, snapshot,
    publish: (value: BattleSnapshot) => context.bridge.emit('battle-snapshot', value) };
}

describe('monotonic snapshot tutorial observation', () => {
  it('remembers actions done early, death, cooldown expiry and returning to the starting position without demanding them again', () => {
    const session = new BattleSession({ runId: 1 }); const initial = session.snapshot();
    let progress = observeTutorial(initialTutorialProgress(), initial);
    progress = observeTutorial(progress, { ...initial, hero: { ...initial.hero, x: initial.hero.x + 20 }, skillCooldowns: { ...initial.skillCooldowns, 'hello-world': 1 } });
    expect(tutorialStep(progress, true)).toBe(1);
    session.dispatch({ type: 'summon', kind: 'melee' });
    progress = observeTutorial(progress, session.snapshot()); expect(tutorialStep(progress, true)).toBe(2);
    progress = observeTutorial(progress, { ...session.snapshot(), economyLevel: 2 }); expect(tutorialStep(progress, true)).toBe(5);
    // Later snapshots can no longer show the dead summon or an expired cast/movement.
    progress = observeTutorial(progress, { ...initial, economyLevel: 2 });
    expect(progress).toMatchObject({ everSummoned: true, everInvested: true, everCast: true, everMoved: true });
    expect(tutorialStep(progress, true)).toBe(5);
  });

  it('separates reading acknowledgements from gameplay observations and skips only the missing skill step', () => {
    const original = Object.freeze(initialTutorialProgress()); let progress = original;
    const steps = [];
    for (let index = 0; index < 4; index++) { steps.push(tutorialStep(progress, true)); progress = acknowledgeTutorialStep(progress, true); }
    expect(steps).toEqual([1, 2, 3, 4]); expect(tutorialStep(progress, true)).toBe(5);
    expect(progress).toMatchObject({ everSummoned: false, everInvested: false, everCast: false, everMoved: false });
    const noSkill = { ...initialTutorialProgress(), everSummoned: true, everInvested: true };
    expect(tutorialStep(noSkill, false)).toBe(4); expect(tutorialStep(noSkill, true)).toBe(3);
    expect(original.acknowledgedThrough).toBe(0);
  });
});

describe('first battle contextual guidance', () => {
  it('observes actual public actions in order and completes without changing any battle command or clock itself', () => {
    const { context, model, session, publish } = fixture();
    expect(model.introGuide.value).toMatchObject({ step: 1, key: '1', completed: false });
    expect(session.dispatch({ type: 'summon', kind: 'melee' }).accepted).toBe(true); publish(session.snapshot());
    expect(model.introGuide.value).toMatchObject({ step: 2, key: 'U' });
    expect(session.dispatch({ type: 'upgrade-economy' }).accepted).toBe(true); publish(session.snapshot());
    expect(model.introGuide.value).toMatchObject({ step: 3, key: 'J' });
    expect(model.introGuide.value?.body).toContain('적이 사거리 안에 들어오면');
    session.dispatch({ type: 'skill', skill: 'hello-world' }); publish(session.snapshot());
    expect(model.introGuide.value).toMatchObject({ step: 4, key: 'A/D' });
    session.dispatch({ type: 'move', direction: 1 }); session.step(.1); publish(session.snapshot());
    expect(model.introGuide.value).toMatchObject({ step: 4, progress: 1, completed: true });
    expect(model.introGuide.value?.body).toContain('후퇴');
    const before = session.snapshot(); model.nextIntroGuide(); model.dismissIntro();
    expect(session.snapshot()).toEqual(before); expect(model.introGuide.value).toBeNull(); context.dispose();
  });

  it.each(['sleep', 'heal', 'git-push', 'overclock', 'foreach'] as SkillKind[])('uses the captured first %s label and fixed key with a situational condition', kind => {
    const { context, model } = fixture([kind]); model.nextIntroGuide(); model.nextIntroGuide();
    expect(model.introGuide.value?.title).toContain(model.primarySkill.value!.label);
    expect(model.introGuide.value?.key).toBe(SKILL_KEYS[kind]);
    if (kind === 'heal') expect(model.introGuide.value?.body).toContain('아군이 다쳤을 때');
    else if (kind === 'overclock') expect(model.introGuide.value?.body).toContain('자금을 비축');
    else expect(model.introGuide.value?.body).toContain('적이 사거리 안에 들어오면');
    context.dispose();
  });

  it('has no skill demand in an empty loadout and points an empty first page to the actual filled second page', () => {
    const { context, scope, model, session, publish } = fixture([]);
    const formation = new BattleSession({ runId: scope.id, equippedSkills: [], equippedAllies: [null, null, null, null, null, 'ranged'] }).snapshot();
    publish(formation); expect(model.introGuide.value).toMatchObject({ step: 1, key: 'Q' });
    model.setUnitPage(1); expect(model.introGuide.value).toMatchObject({ step: 1, key: '1' });
    model.nextIntroGuide(); model.nextIntroGuide();
    expect(model.introGuide.value).toMatchObject({ step: 4, key: 'A/D' });
    expect(model.introGuide.value?.body).toContain('장착 스킬이 없으니');
    model.nextIntroGuide(); expect(model.introGuide.value?.completed).toBe(true);
    expect(session.snapshot().elapsed).toBe(0); context.dispose();
  });

  it('keeps next/dismiss free, hides on pause/end/stale/disposal and never advances from stale snapshots', () => {
    const { context, scope, model, session, snapshot, publish } = fixture();
    const commands = vi.fn(); const off = context.bridge.subscribe('battle-command', commands);
    model.nextIntroGuide(); expect(model.introGuide.value?.step).toBe(2);
    publish({ ...snapshot, status: 'paused' }); expect(model.introGuide.value).toBeNull(); model.nextIntroGuide();
    publish(snapshot); expect(model.introGuide.value?.step).toBe(2);
    context.bridge.emit('battle-snapshot', { ...snapshot, runId: scope.id + 1, economyLevel: 2 }); expect(model.introGuide.value?.step).toBe(2);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id + 1, phase: 'ready' }); expect(model.introGuide.value).toBeNull();
    publish({ ...snapshot, economyLevel: 2 }); model.nextIntroGuide();
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' }); expect(model.introGuide.value?.step).toBe(2);
    publish({ ...snapshot, status: 'lost', hero: { ...snapshot.hero, hp: 0 } }); expect(model.introGuide.value).toBeNull();
    model.nextIntroGuide(); publish(snapshot); expect(model.introGuide.value?.step).toBe(2);
    model.dismissIntro(); publish(snapshot); expect(model.introGuide.value).toBeNull();
    expect(session.snapshot()).toEqual(snapshot); expect(commands).not.toHaveBeenCalled();
    off(); context.dispose();
    const second = fixture(); expect(second.model.introGuide.value).not.toBeNull();
    second.scope.dispose(); expect(second.model.introGuide.value).toBeNull(); second.model.nextIntroGuide(); second.publish(second.snapshot);
    expect(second.model.introGuide.value).toBeNull(); second.context.dispose();
  });

  it('retains the existing session-only first battle policy across dismissal and a new run', () => {
    const context = new AppContext(), shell = createShellViewModel(context);
    const first = context.lifetimes.begin(scene()); context.bridge.emit('scene-state', { scene: 'Battle', runId: first.id, phase: 'ready' });
    context.bridge.emit('battle-snapshot', new BattleSession({ runId: first.id }).snapshot());
    expect(shell.screen.value?.introGuide.value?.step).toBe(1); shell.screen.value?.dismissIntro(); first.dispose();
    const next = context.lifetimes.begin(scene()); context.bridge.emit('scene-state', { scene: 'Battle', runId: next.id, phase: 'ready' });
    context.bridge.emit('battle-snapshot', new BattleSession({ runId: next.id }).snapshot());
    expect(shell.screen.value?.intro.value).toBe(false); expect(shell.screen.value?.introGuide.value).toBeNull();
    shell.dispose(); context.dispose();
  });
});


describe('first-clear ally display metadata', () => {
  it('maps original current-level portraits and roles from an actual result without accepting another run or writing progress', () => {
    const { context, scope, model } = fixture();
    const initial = context.profile.snapshot();
    const result = { runId: scope.id, stageId: '1-1', reward: 120, prototypeComplete: false, firstClear: true, newlyUnlockedAllies: ['technician' as const] };
    context.bridge.emit('battle-result', { ...result, runId: scope.id + 1 }); expect(model.newAllies.value).toEqual([]);
    context.bridge.emit('battle-result', result);
    expect(model.newAllies.value).toMatchObject([{ kind: 'technician', role: '튼튼한 탱커', cost: 150 }]);
    expect(model.newAllies.value[0].image).toContain('technician.png');
    expect(model.newAllies.value[0].description).not.toBe('');
    expect(context.profile.snapshot()).toEqual(initial);
    // Public earned progression supplies enough XP for a current level-5 portrait.
    for (const id of ['1-1', '1-2', '1-3', '1-4']) context.profile.rewardWin(id, id);
    for (let upgrade = 0; upgrade < 4; upgrade++) expect(context.profile.upgrade('technician').accepted).toBe(true);
    expect(model.newAllies.value[0].image).toContain('technician-lv5.png');
    const beforeDispose = model.newAllies.value;
    scope.dispose(); context.bridge.emit('battle-result', { ...result, newlyUnlockedAllies: ['judge'] });
    expect(model.newAllies.value).toEqual(beforeDispose); context.dispose();
  });
});
