import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { BattleSession } from '../src/game/BattleSession';
import { createBattleViewModel } from '../src/ui/viewmodels/BattleViewModel';
import { createLobbyViewModel } from '../src/ui/viewmodels/LobbyViewModel';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';
const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;

describe('developer mode presentation uses the single Profile projection', () => {
  it('shows infinite XP without nonfinite cost text and preserves lock, level and loadout rules', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: 'shop' });
    const model = createLobbyViewModel(context, scope, 'shop'); const original = context.profile.snapshot();
    expect(model.xpLabel.value).toBe('0'); expect(model.shopSkills.value.every(skill => skill.disabled)).toBe(true);
    context.profile.setDeveloperMode(true);
    expect(model.xpLabel.value).toBe('∞'); expect(model.profile.value.xp).toBe(Infinity);
    expect(model.shopSkills.value.every(skill => !skill.disabled)).toBe(true);
    expect(model.profile.value.unlockedSkills).toEqual(original.unlockedSkills);
    expect(model.profile.value.unlockedAllies).toEqual(original.unlockedAllies);
    expect(model.characters.value.find(character => character.kind === 'technician')!.disabled).toBe(true);
    model.purchaseSkill('sleep'); expect(model.shopSkills.value.find(skill => skill.kind === 'sleep')!.reason).toBe('해금 완료');
    for (let level = 1; level < 10; level++) model.upgradeCharacter('hero');
    expect(model.characters.value.find(character => character.kind === 'hero')).toMatchObject({ level: 10, disabled: true, reason: '최대 레벨' });
    expect([...model.characters.value, ...model.shopSkills.value].every(item => !/Infinity|NaN/.test(item.reason))).toBe(true);
    expect(model.skillLoadout.value).toHaveLength(3); expect(model.formation.value).toHaveLength(10);
    context.profile.setDeveloperMode(false); expect(model.xpLabel.value).toBe('0'); expect(context.profile.snapshot()).toEqual(original);
    expect(model.upgradeFeedback.value).toContain('원래 육성'); expect(model.upgradeFeedback.value).not.toContain('구매 완료');
    context.dispose();
  });
  it('allows inspecting every map while on and relocks a selected late stage without resetting the selection on exit', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: 'stages' });
    const model = createLobbyViewModel(context, scope, 'stages');
    model.selectStage('2-5'); expect(model.selectedStage.value.locked).toBe(true);
    context.profile.toggleDeveloperMode(); expect(model.stages.value.every(stage => !stage.locked)).toBe(true);
    expect(model.selectedStage.value.locked).toBe(false); expect(context.stageForBattle('2-5')?.id).toBe('2-5');
    expect(model.profile.value.clearedStages).toEqual([]);
    context.profile.toggleDeveloperMode(); expect(model.selectedStageId.value).toBe('2-5'); expect(model.selectedStage.value.locked).toBe(true);
    expect(context.stageForBattle('2-5')).toBeUndefined(); context.dispose();
  });
  it('updates the app-owned badge state before assets are ready and releases its subscription on dispose', () => {
    const context = new AppContext(); const shell = createShellViewModel(context);
    expect(shell.screen.value).toBeNull(); expect(shell.developerMode.value).toBe(false);
    context.profile.setDeveloperMode(true); expect(shell.developerMode.value).toBe(true);
    shell.dispose(); context.profile.setDeveloperMode(false); expect(shell.developerMode.value).toBe(true);
    context.dispose();
  });
  it('keeps an underway battle level capture unchanged when the temporary upgrade projection changes', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const session = new BattleSession({ runId: scope.id, levels: context.profile.snapshot().levels });
    const model = createBattleViewModel(context, scope, false); context.bridge.emit('battle-snapshot', session.snapshot());
    const before = session.snapshot(); context.profile.setDeveloperMode(true); context.profile.upgrade('hero');
    expect(context.profile.snapshot().levels.hero).toBe(2); expect(model.battle.value?.hero.level).toBe(1);
    expect(session.snapshot()).toEqual(before); context.profile.setDeveloperMode(false); expect(session.snapshot()).toEqual(before);
    context.dispose();
  });
});

describe('developer result labels survive mode exit without claiming normal progression', () => {
  it('rejects stale developer metadata and distinguishes a tainted final win from a normal complete result', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    const model = createBattleViewModel(context, scope, false); const state = new BattleSession({ runId: scope.id }).snapshot();
    context.bridge.emit('battle-snapshot', { ...state, stageId: '2-5', status: 'won' });
    context.bridge.emit('battle-result', { runId: scope.id + 1, stageId: '2-5', reward: 650, prototypeComplete: true, developerRun: true });
    expect(model.developerRun.value).toBe(false);
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '2-5', reward: 650, prototypeComplete: true, developerRun: true, newlyUnlockedAllies: ['technician'] });
    expect(model.developerRun.value).toBe(true); expect(model.reward.value).toBe(0); expect(model.prototypeComplete.value).toBe(false);
    expect(model.newAllies.value).toEqual([]); expect(model.resultTitle.value).toContain('테스트'); expect(model.resultDescription.value).not.toContain('모두 클리어');
    context.profile.setDeveloperMode(true); context.profile.setDeveloperMode(false);
    expect(model.developerRun.value).toBe(true); expect(model.resultDescription.value).toContain('정상 육성');
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '2-5', reward: 650, prototypeComplete: true });
    expect(model.developerRun.value).toBe(true); expect(model.reward.value).toBe(0); expect(model.prototypeComplete.value).toBe(false); // Same-run duplicate cannot remove its taint.
    context.bridge.emit('battle-snapshot', { ...state, stageId: '1-2', status: 'won' });
    context.bridge.emit('battle-result', { runId: scope.id, stageId: '1-2', reward: 0, prototypeComplete: false, developerRun: true });
    expect(model.hasNextStage.value).toBe(false); scope.dispose();
    const freshScope = context.lifetimes.begin(fakeScene()); const normal = createBattleViewModel(context, freshScope, false);
    context.bridge.emit('battle-snapshot', { ...state, runId: freshScope.id, stageId: '2-5', status: 'won' });
    context.bridge.emit('battle-result', { runId: freshScope.id, stageId: '2-5', reward: 650, prototypeComplete: true });
    expect(normal.developerRun.value).toBe(false); expect(normal.reward.value).toBe(650); expect(normal.prototypeComplete.value).toBe(true); context.dispose();
  });
});
