import { EventEmitter } from 'node:events';
import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { AppContext } from '../src/core/AppContext';
import { createLobbyViewModel } from '../src/ui/viewmodels/LobbyViewModel';
import { createShellViewModel } from '../src/ui/viewmodels/ShellViewModel';
const fakeScene = () => ({ events: new EventEmitter() }) as unknown as Phaser.Scene;
describe('lobby MVVM', () => {
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
