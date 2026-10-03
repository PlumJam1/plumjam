import Phaser from 'phaser';
import type { AppContext } from '../core/AppContext';
import { BootScene } from '../scenes/BootScene';
import { LobbyScene } from '../scenes/LobbyScene';
import { BattleScene } from '../scenes/BattleScene';
import { FIELD } from './battle/balance';

export function createGame(parent: HTMLElement, context: AppContext): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: FIELD.width,
    height: FIELD.height,
    pixelArt: true,
    backgroundColor: '#233342',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [new BootScene(context), new LobbyScene(context), new BattleScene(context)],
  });
}
