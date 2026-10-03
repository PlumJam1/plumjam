import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { createLobbyViewModel } from '../src/ui/viewmodels/LobbyViewModel';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';
const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
describe('lobby MVVM', () => {
  it('shows shop ownership and affordability, purchases only in its active Lobby run and expires on disposal', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: 'shop' });
    const model = createLobbyViewModel(context, scope, 'shop');
    expect(model.lobbyTab.value).toBe('shop');
    expect(model.shopSkills.value).toHaveLength(5);
    expect(model.shopSkills.value.find(skill => skill.kind === 'git-push')).toMatchObject({ cost: 240, unlocked: false, disabled: true, reason: '재화 240 부족' });
    const purchase = vi.spyOn(context.profile, 'purchaseSkill');
    context.profile.rewardWin('one', '1-1'); context.profile.rewardWin('two', '1-1');
    expect(model.shopSkills.value.find(skill => skill.kind === 'git-push')!.disabled).toBe(false);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    model.purchaseSkill('git-push'); expect(purchase).not.toHaveBeenCalled();
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id + 1, phase: 'ready' });
    model.purchaseSkill('git-push'); expect(purchase).not.toHaveBeenCalled();
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: 'shop' });
    model.purchaseSkill('git-push'); expect(purchase).toHaveBeenCalledTimes(1);
    expect(model.shopSkills.value.find(skill => skill.kind === 'git-push')!).toMatchObject({ unlocked: true, disabled: true, reason: '해금 완료' });
    expect(model.profile.value.xp).toBe(0);
    expect(model.upgradeFeedback.value).toContain('구매 완료');
    scope.dispose(); model.purchaseSkill('git-push');
    expect(purchase).toHaveBeenCalledTimes(1);
    context.dispose();
  });
  it('previews locked stages without authorizing deployment, and starts through title presentation', () => {
    const context = new AppContext();
    const shell = createShellViewModel(context);
    const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    expect(shell.titleVisible.value).toBe(true); shell.enterLobby(); expect(shell.titleVisible.value).toBe(false);
    const model = shell.screen.value!;
    model.selectStage('1-5');
    expect(model.selectedStage.value.locked).toBe(true);
    const sent: string[] = [];
    context.bridge.subscribe('scene-command', ({ command }) => { if (command.type === 'start-battle') sent.push(command.stageId); });
    model.startBattle('1-5'); expect(sent).toEqual([]);
    model.startBattle('1-1'); expect(sent).toEqual(['1-1']);
    scope.dispose(); model.startBattle('1-1'); expect(sent).toEqual(['1-1']);
    shell.dispose(); context.dispose();
  });
  it('updates XP/upgrade previews and stops reacting after scope disposal', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: 'training' });
    const model = createLobbyViewModel(context, scope, 'training');
    for (let run = 0; run < 4; run++) context.profile.rewardWin(String(run), '1-1');
    for (let level = 1; level < 5; level++) model.upgradeCharacter('hero');
    expect(model.characters.value[0]).toMatchObject({ level: 5, evolved: true, image: '/assets/generated/hero-lv5.png' });
    expect(model.characters.value[1].level).toBe(1);
    const previous = model.profile.value.xp;
    scope.dispose(); context.profile.rewardWin('after', '1-1');
    expect(model.profile.value.xp).toBe(previous);
    context.dispose();
  });
});


describe('formation MVVM', () => {
  it('selects slots, swaps existing allies, equips earned allies and protects the last teammate', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready', lobbyTab: 'formation' });
    const model = createLobbyViewModel(context, scope, 'formation');
    expect(model.formation.value).toHaveLength(10); expect(model.roster.value).toHaveLength(9);
    expect(model.roster.value.find(ally => ally.kind === 'technician')).toMatchObject({ unlocked: false, reason: '1-1 첫 클리어로 해금' });
    model.selectSlot(1); model.equipAlly('melee');
    expect(context.profile.snapshot().equippedAllies).toEqual(['ranged', 'melee', 'support', null, null, null, null, null, null, null]);
    context.profile.rewardWin('first', '1-1'); model.selectSlot(3); model.equipAlly('technician');
    expect(context.profile.snapshot().equippedAllies).toEqual(['ranged', 'melee', 'support', 'technician', null, null, null, null, null, null]);
    expect(model.formationSummary.value).toContain('기술직');
    context.profile.setFormation(['melee', null, null, null, null, null, null, null, null, null]); model.selectSlot(0); model.removeAlly();
    expect(context.profile.snapshot().equippedAllies).toEqual(['melee', null, null, null, null, null, null, null, null, null]);
    expect(model.upgradeFeedback.value).toContain('최소 1명');
    context.dispose();
  });
  it('guards profile mutations by active Lobby scope and displays fixed support versus scalable heal', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    const model = createLobbyViewModel(context, scope, 'formation'); const equip = vi.spyOn(context.profile, 'setFormation');
    expect(model.characters.value.find(character => character.kind === 'support')).toMatchObject({ stat: 1.3, nextStat: 1.3, statLabel: '공격속도 ×' });
    expect(model.characters.value.find(character => character.kind === 'counselor')).toMatchObject({ stat: 35, nextStat: 40, disabled: true, reason: '1-3 첫 클리어로 해금' });
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' }); model.equipAlly('melee'); model.removeAlly(); expect(equip).not.toHaveBeenCalled();
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id + 1, phase: 'ready' }); model.equipAlly('melee'); expect(equip).not.toHaveBeenCalled();
    scope.dispose(); model.equipAlly('melee'); expect(equip).not.toHaveBeenCalled(); context.dispose();
  });
});


describe('lobby character browsing', () => {
  it('cycles every owned or locked character without spending, equipping or upgrading and guards stale scopes', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    const model = createLobbyViewModel(context, scope, 'formation');
    const original = context.profile.snapshot();
    expect(model.selectedAllyKind.value).toBe('melee');
    model.shiftAlly(-1); expect(model.selectedAllyKind.value).toBe('singer');
    model.shiftAlly(1); expect(model.selectedAllyKind.value).toBe('melee');
    model.selectAlly('technician'); expect(model.selectedAllyKind.value).toBe('technician');
    expect(model.roster.value.find(ally => ally.kind === 'technician')?.unlocked).toBe(false);
    model.shiftAlly(0.5); expect(model.selectedAllyKind.value).toBe('technician');
    model.selectCharacter('singer'); model.shiftCharacter(1); expect(model.selectedCharacterKind.value).toBe('hero');
    model.shiftCharacter(-1); expect(model.selectedCharacterKind.value).toBe('singer');
    model.selectCharacter('technician'); expect(model.selectedCharacterKind.value).toBe('technician');
    expect(context.profile.snapshot()).toEqual(original);
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    model.selectAlly('support'); model.shiftAlly(1); model.selectCharacter('hero'); model.shiftCharacter(1);
    expect(model.selectedAllyKind.value).toBe('technician'); expect(model.selectedCharacterKind.value).toBe('technician');
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id + 1, phase: 'ready' });
    model.selectAlly('support'); model.selectCharacter('hero'); expect(model.selectedAllyKind.value).toBe('technician'); expect(model.selectedCharacterKind.value).toBe('technician');
    scope.dispose(); model.shiftAlly(1); model.shiftCharacter(1);
    expect(model.selectedAllyKind.value).toBe('technician'); expect(model.selectedCharacterKind.value).toBe('technician');
    expect(context.profile.snapshot()).toEqual(original); context.dispose();
  });
});


describe('lobby skill equipment', () => {
  it('browses, buys, removes, adds and replaces skills only in its current Lobby without charging for equipment', () => {
    const context = new AppContext(); const scope = context.lifetimes.begin(fakeScene());
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id, phase: 'ready' });
    const model = createLobbyViewModel(context, scope, 'shop');
    expect(model.skillLoadout.value.map(slot => slot.kind)).toEqual(['hello-world', null, null]);
    for (let run = 0; run < 8; run++) context.profile.rewardWin(String(run), '1-1');
    model.purchaseSkill('sleep'); model.purchaseSkill('heal'); model.purchaseSkill('overclock');
    expect(context.profile.snapshot().equippedSkills).toEqual(['hello-world']);
    const xp = context.profile.snapshot().xp;
    model.selectSkillSlot(2); expect(model.selectedSkillSlot.value).toBe(1);
    model.selectSkillSlot(1); model.equipSkill('sleep'); model.selectSkillSlot(2); model.equipSkill('heal');
    expect(model.skillLoadout.value.map(slot => slot.kind)).toEqual(['hello-world', 'sleep', 'heal']);
    model.selectSkillSlot(0); model.equipSkill('overclock');
    expect(context.profile.snapshot().equippedSkills).toEqual(['overclock', 'sleep', 'heal']);
    model.equipSkill('sleep'); expect(context.profile.snapshot().equippedSkills).toEqual(['overclock', 'heal']);
    model.removeSkill(); expect(context.profile.snapshot().equippedSkills).toEqual(['heal']);
    model.removeSkill(); expect(context.profile.snapshot().equippedSkills).toEqual([]);
    model.selectSkillSlot(2); expect(model.selectedSkillSlot.value).toBe(0);
    expect(context.profile.snapshot().xp).toBe(xp);
    const set = vi.spyOn(context.profile, 'setEquippedSkills');
    context.bridge.emit('scene-state', { scene: 'Battle', runId: scope.id, phase: 'ready' });
    model.selectSkillSlot(2); model.equipSkill('hello-world'); model.removeSkill(); expect(set).not.toHaveBeenCalled();
    context.bridge.emit('scene-state', { scene: 'Lobby', runId: scope.id + 1, phase: 'ready' }); model.equipSkill('hello-world'); expect(set).not.toHaveBeenCalled();
    scope.dispose(); model.equipSkill('hello-world'); expect(set).not.toHaveBeenCalled(); context.dispose();
  });
});
