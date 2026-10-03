import type { BattleViewMode } from '../game/presentation/battleCamera';
import { nextStage } from '../game/progression/stages';
import Phaser from 'phaser';
import type { AppContext } from '../core/AppContext';
import type { SceneScope } from '../core/SceneLifetimeManager';
import { BattleSession, getFormationCommand } from '../game/BattleSession';
import { PhaserBattleRenderer } from '../game/PhaserBattleRenderer';
import { FORMATION_PAGE_SIZE } from '../game/battle/balance';
import type { BattleCommand, BattleSpeed } from '../game/battle/types';

export class BattleScene extends Phaser.Scene {
  private scope!: SceneScope;
  private stageId = '1-1';
  private session!: BattleSession;
  private battleRenderer!: PhaserBattleRenderer;
  private receipt = '';
  private resultPublished = false;

  constructor(private readonly context: AppContext) { super('Battle'); }

  init(data?: { stageId?: string }): void {
    this.scope = this.context.lifetimes.begin(this);
    this.stageId = data?.stageId ?? '1-1';
    this.receipt = this.context.newBattleReceipt();
    this.resultPublished = false;
  }

  create(): void {
    const stage = this.context.stageForBattle(this.stageId);
    if (!stage) { this.scene.start('Lobby'); return; }
    const scope = this.scope;
    const profile = this.context.profile.snapshot();
    this.session = new BattleSession({ runId: scope.id, stage, levels: profile.levels, unlockedSkills: profile.unlockedSkills, equippedSkills: profile.equippedSkills, equippedAllies: profile.equippedAllies, unlockedAllies: profile.unlockedAllies });
    const session = this.session;
    this.battleRenderer = new PhaserBattleRenderer(this, stage.theme, stage.id);
    const battleRenderer = this.battleRenderer;
    scope.defer(this.context.bridge.subscribe('battle-preview', ({ runId, skill }) => {
      if (scope.disposed || runId !== scope.id) return;
      battleRenderer.setPreview(session.snapshot().status === 'active' ? skill : null);
      battleRenderer.render(session.snapshot());
    }));
    scope.defer(() => { this.context.sound.stopRun(scope.id); session.dispose(); battleRenderer.destroy(); });
    scope.defer(this.context.bridge.subscribe('battle-command', ({ runId, command }) => {
      if (scope.disposed || runId !== scope.id) return;
      const result = session.dispatch(command);
      // Movement is continuous input, not a notice; it must not erase skill/funds feedback.
      if (command.type !== 'move') {
        this.context.bridge.emit('battle-feedback', { runId, result });
        if (result.accepted && command.type !== 'set-speed') this.context.sound.play(command.type === 'summon' ? 'summon' : command.type === 'skill' ? command.skill : 'invest', runId);
      }
      this.publishBattle();
    }));
    scope.defer(this.context.bridge.subscribe('scene-command', ({ runId, command }) => {
      if (scope.disposed || runId !== scope.id) return;
      if (command.type === 'return-lobby') this.scene.start('Lobby', { tab: command.tab });
      else if (command.type === 'restart-battle') this.scene.restart({ stageId: this.stageId });
      else if (command.type === 'start-battle' && session.snapshot().status === 'won' && this.context.stageForBattle(command.stageId)) this.scene.restart({ stageId: command.stageId });
      else if (command.type === 'toggle-pause') {
        if (session.snapshot().status === 'won' || session.snapshot().status === 'lost') return;
        if (this.scene.isPaused()) this.scene.resume();
        else this.scene.pause();
      }
    }));
    const publish = () => {
      session.setPaused(this.scene.isPaused());
      this.context.bridge.emit('scene-state', {
        scene: 'Battle', runId: scope.id, stageId: this.stageId,
        phase: this.scene.isPaused() ? 'paused' : 'ready',
      });
      this.publishBattle();
    };
    let unitPage: 0 | 1 = 0;
    scope.defer(this.context.bridge.subscribe('battle-page', ({ runId, page }) => {
      if (scope.disposed || runId !== scope.id || this.context.bridge.sceneState?.runId !== scope.id || (page !== 0 && page !== 1)) return;
      const status = session.snapshot().status;
      if (status === 'active' || status === 'paused') unitPage = page;
    }));
    let viewMode: BattleViewMode = 'close';
    scope.defer(this.context.bridge.subscribe('battle-view', ({ runId, mode }) => {
      if (scope.disposed || runId !== scope.id || this.context.bridge.sceneState?.runId !== scope.id || (mode !== 'close' && mode !== 'overview')) return;
      const snapshot = session.snapshot();
      if (snapshot.status !== 'active' && snapshot.status !== 'paused') return;
      viewMode = mode;
      battleRenderer.setViewMode(mode);
      // Paused scenes do not update, so redraw the camera without advancing any clock.
      battleRenderer.render(snapshot);
    }));
    const pressed = new Set<string>();
    const dispatch = (command: BattleCommand) => this.context.bridge.emit('battle-command', { runId: scope.id, command });
    const movement = () => dispatch({ type: 'move', direction: (Number(pressed.has('KeyD') || pressed.has('ArrowRight')) - Number(pressed.has('KeyA') || pressed.has('ArrowLeft'))) as -1 | 0 | 1 });
    const clearMovement = () => { pressed.clear(); if (session.snapshot().status === 'active') dispatch({ type: 'move', direction: 0 }); };
    const paused = () => { this.context.sound.stopRun(scope.id); clearMovement(); publish(); };
    this.events.on(Phaser.Scenes.Events.PAUSE, paused);
    this.events.on(Phaser.Scenes.Events.RESUME, publish);
    scope.defer(() => {
      this.events.off(Phaser.Scenes.Events.PAUSE, paused);
      this.events.off(Phaser.Scenes.Events.RESUME, publish);
    });
    // DOM input can resume a paused Scene, whose Phaser input plugin stops updating.
    const keyDown = (event: KeyboardEvent) => {
      if (scope.disposed || this.context.bridge.sceneState?.runId !== scope.id || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable) || event.ctrlKey || event.metaKey || event.altKey) return;
      this.context.sound.unlock();
      if (event.code === 'Escape') {
        if (!event.repeat) this.context.bridge.emit('scene-command', { runId: scope.id, command: { type: 'toggle-pause' } });
        event.preventDefault(); return;
      }
      if (event.code === 'KeyV') {
        event.preventDefault();
        const status = session.snapshot().status;
        if (!event.repeat && (status === 'active' || status === 'paused')) this.context.bridge.emit('battle-view', { runId: scope.id, mode: viewMode === 'close' ? 'overview' : 'close' });
        return;
      }
      if (event.code === 'KeyQ') {
        event.preventDefault();
        const status = session.snapshot().status;
        if (!event.repeat && (status === 'active' || status === 'paused')) this.context.bridge.emit('battle-page', { runId: scope.id, page: unitPage === 0 ? 1 : 0 });
        return;
      }
      if (event.code === 'KeyR') {
        event.preventDefault();
        if (!event.repeat) dispatch({ type: 'set-speed', speed: (session.snapshot().speed % 3 + 1) as BattleSpeed });
        return;
      }
      if (this.scene.isPaused() || session.snapshot().status !== 'active') return;
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); pressed.add(event.code); movement(); return; }
      const commands: Record<string, BattleCommand> = {
        KeyJ: { type: 'skill', skill: 'hello-world' }, KeyK: { type: 'skill', skill: 'sleep' }, KeyL: { type: 'skill', skill: 'heal' },
        KeyP: { type: 'skill', skill: 'git-push' }, KeyO: { type: 'skill', skill: 'overclock' }, KeyI: { type: 'skill', skill: 'foreach' },
        KeyU: { type: 'upgrade-economy' },
      };
      const slot = /^Digit[1-5]$/.test(event.code) ? Number(event.code.slice(-1)) - 1 : -1;
      if (slot >= 0) {
        event.preventDefault();
        const command = getFormationCommand(session.snapshot().equippedAllies, slot + unitPage * FORMATION_PAGE_SIZE);
        if (command && !event.repeat) dispatch(command);
        return;
      }
      if (commands[event.code]) { event.preventDefault(); if (!event.repeat) dispatch(commands[event.code]); }
    };
    const keyUp = (event: KeyboardEvent) => { if (pressed.delete(event.code)) { event.preventDefault(); if (!this.scene.isPaused()) movement(); } };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    scope.defer(() => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); pressed.clear(); });
    const blur = () => { if (!scope.disposed) { clearMovement(); if (!this.scene.isPaused() && session.snapshot().status === 'active') this.scene.pause(); } };
    this.game.events.on(Phaser.Core.Events.BLUR, blur);
    scope.defer(() => this.game.events.off(Phaser.Core.Events.BLUR, blur));
    publish();
  }

  update(_time: number, delta: number): void {
    if (this.scope.disposed) return;
    this.session.step(Math.min(delta / 1000, 0.1));
    this.publishBattle();
  }

  private publishBattle(): void {
    const snapshot = this.session.snapshot();
    if (!this.resultPublished && (snapshot.status === 'won' || snapshot.status === 'lost')) {
      this.resultPublished = true;
      this.context.sound.play(snapshot.status === 'won' ? 'win' : 'lose', this.scope.id);
      const before = this.context.profile.snapshot();
      const reward = snapshot.status === 'won' ? this.context.profile.rewardWin(this.receipt, this.stageId) : 0;
      const after = this.context.profile.snapshot();
      const firstClear = snapshot.status === 'won' && !before.clearedStages.includes(this.stageId) && after.clearedStages.includes(this.stageId);
      const newlyUnlockedAllies = after.unlockedAllies.filter(kind => !before.unlockedAllies.includes(kind));
      this.context.bridge.emit('battle-result', { firstClear, newlyUnlockedAllies, runId: this.scope.id, stageId: this.stageId, reward, prototypeComplete: snapshot.status === 'won' && !nextStage(this.stageId) });
    }
    this.battleRenderer.render(snapshot);
    this.context.bridge.emit('battle-snapshot', snapshot);
  }
}
