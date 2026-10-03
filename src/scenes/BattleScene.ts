import Phaser from 'phaser';
import type { AppContext } from '../core/AppContext';
import type { SceneScope } from '../core/SceneLifetimeManager';
import { BattleSession } from '../game/BattleSession';
import { PhaserBattleRenderer } from '../game/PhaserBattleRenderer';
import { DEFAULT_STAGE } from '../game/battle/balance';
import type { BattleCommand } from '../game/battle/types';
import { drawPlaceholder } from './drawPlaceholder';

export class BattleScene extends Phaser.Scene {
  private scope!: SceneScope;
  private stageId = '1-1';
  private session!: BattleSession;
  private battleRenderer!: PhaserBattleRenderer;

  constructor(private readonly context: AppContext) { super('Battle'); }

  init(data?: { stageId?: string }): void {
    this.scope = this.context.lifetimes.begin(this);
    this.stageId = data?.stageId ?? '1-1';
  }

  create(): void {
    drawPlaceholder(this, true);
    const scope = this.scope;
    this.session = new BattleSession({ runId: scope.id, stage: { ...DEFAULT_STAGE, id: this.stageId } });
    const session = this.session;
    this.battleRenderer = new PhaserBattleRenderer(this);
    const battleRenderer = this.battleRenderer;
    scope.defer(() => { session.dispose(); battleRenderer.destroy(); });
    scope.defer(this.context.bridge.subscribe('battle-command', ({ runId, command }) => {
      if (scope.disposed || runId !== scope.id) return;
      const result = session.dispatch(command);
      this.context.bridge.emit('battle-feedback', { runId, result });
      this.publishBattle();
    }));
    scope.defer(this.context.bridge.subscribe('scene-command', ({ runId, command }) => {
      if (scope.disposed || runId !== scope.id) return;
      if (command.type === 'return-lobby') this.scene.start('Lobby');
      else if (command.type === 'restart-battle') this.scene.restart({ stageId: this.stageId });
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
    const pressed = new Set<string>();
    const dispatch = (command: BattleCommand) => this.context.bridge.emit('battle-command', { runId: scope.id, command });
    const movement = () => dispatch({ type: 'move', direction: (Number(pressed.has('KeyD') || pressed.has('ArrowRight')) - Number(pressed.has('KeyA') || pressed.has('ArrowLeft'))) as -1 | 0 | 1 });
    const clearMovement = () => { pressed.clear(); if (session.snapshot().status === 'active') dispatch({ type: 'move', direction: 0 }); };
    const paused = () => { clearMovement(); publish(); };
    this.events.on(Phaser.Scenes.Events.PAUSE, paused);
    this.events.on(Phaser.Scenes.Events.RESUME, publish);
    scope.defer(() => {
      this.events.off(Phaser.Scenes.Events.PAUSE, paused);
      this.events.off(Phaser.Scenes.Events.RESUME, publish);
    });
    // DOM input can resume a paused Scene, whose Phaser input plugin stops updating.
    const keyDown = (event: KeyboardEvent) => {
      if (scope.disposed || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Escape') {
        if (!event.repeat) this.context.bridge.emit('scene-command', { runId: scope.id, command: { type: 'toggle-pause' } });
        event.preventDefault(); return;
      }
      if (this.scene.isPaused() || session.snapshot().status !== 'active') return;
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); pressed.add(event.code); movement(); return; }
      const commands: Record<string, BattleCommand> = {
        Digit1: { type: 'summon', kind: 'melee' }, Digit2: { type: 'summon', kind: 'ranged' },
        KeyU: { type: 'upgrade-economy' },
      };
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
    this.battleRenderer.render(snapshot);
    this.context.bridge.emit('battle-snapshot', snapshot);
  }
}
