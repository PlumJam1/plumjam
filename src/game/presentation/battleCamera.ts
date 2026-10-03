import { FIELD } from '../battle/balance';

export type BattleViewMode = 'close' | 'overview';
export const BATTLE_CAMERA = { closeZoom: 1.5, heroFraction: .35, bottomMargin: 24, backdropBottom: FIELD.groundY + 32 } as const;

/** Native Phaser viewport units. The CSS FIT scale is applied after this camera transform. */
export function getBattleCamera(heroX: number, mode: BattleViewMode = 'close') {
  const zoom = mode === 'overview' ? 1 : BATTLE_CAMERA.closeZoom;
  const width = FIELD.width / zoom, height = FIELD.height / zoom;
  const focus = Number.isFinite(heroX) ? heroX : FIELD.heroStartX;
  const x = Math.max(0, Math.min(FIELD.width - width, focus - width * BATTLE_CAMERA.heroFraction));
  const y = FIELD.groundY - (FIELD.height - BATTLE_CAMERA.bottomMargin) / zoom;
  // Phaser 4.2.1 Camera.preRender zooms around the viewport center: scroll is not worldView.x/y.
  const scrollX = x + width / 2 - FIELD.width / 2;
  const scrollY = y + height / 2 - FIELD.height / 2;
  return { mode, zoom, scrollX, scrollY, worldView: { x, y, width, height }, groundScreenY: FIELD.height - BATTLE_CAMERA.bottomMargin };
}
