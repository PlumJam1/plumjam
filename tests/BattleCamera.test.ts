import { describe, expect, it } from 'vitest';
import { BattleSession, getPushDestination } from '../src/game/BattleSession';
import { FIELD, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import { BATTLE_CAMERA, getBattleCamera, type BattleViewMode } from '../src/game/presentation/battleCamera';

// The installed Phaser 4.2.1 Camera.preRender matrix: viewport-center zoom, then world scroll.
const screenX = (worldX: number, view: ReturnType<typeof getBattleCamera>) => (worldX - view.scrollX - FIELD.width / 2) * view.zoom + FIELD.width / 2;
const screenY = (worldY: number, view: ReturnType<typeof getBattleCamera>) => (worldY - view.scrollY - FIELD.height / 2) * view.zoom + FIELD.height / 2;

describe('battle camera world framing', () => {
  it('opens at 1.5x with the human base visible and shows the enemy base at the far-right hero position', () => {
    const initial = getBattleCamera(FIELD.heroStartX);
    expect(initial.zoom).toBe(1.5); expect(initial.worldView.x).toBe(0);
    expect(initial.worldView.width).toBeCloseTo(426.666667);
    expect(initial.worldView.height).toBeCloseTo(226.666667);
    expect(screenX(FIELD.humanBaseX, initial)).toBeGreaterThan(0);
    expect(screenX(FIELD.humanBaseX, initial)).toBeLessThan(FIELD.width);
    const final = getBattleCamera(FIELD.heroMaxX);
    expect(final.worldView.x + final.worldView.width).toBeCloseTo(FIELD.width);
    expect(screenX(FIELD.aiBaseX, final)).toBeGreaterThan(0);
    expect(screenX(FIELD.aiBaseX, final)).toBeLessThan(FIELD.width);
  });

  it.each(['close', 'overview'] as BattleViewMode[])('keeps the complete hero inside world bounds and grounds at screen316 throughout %s mode', mode => {
    for (let x = FIELD.heroMinX; x <= FIELD.heroMaxX; x++) {
      const view = getBattleCamera(x, mode);
      expect(view.worldView.x).toBeGreaterThanOrEqual(0);
      expect(view.worldView.x + view.worldView.width).toBeLessThanOrEqual(FIELD.width + 1e-8);
      expect(screenX(x - 23, view)).toBeGreaterThan(0);
      expect(screenX(x + 23, view)).toBeLessThan(FIELD.width);
      expect(screenY(FIELD.groundY, view)).toBeCloseTo(FIELD.height - 24);
      expect(view.worldView.y).toBeGreaterThanOrEqual(FIELD.cameraY);
      expect(view.worldView.y + view.worldView.height).toBeLessThanOrEqual(BATTLE_CAMERA.backdropBottom);
      expect(screenY(FIELD.groundY + 14, view)).toBeLessThan(FIELD.height); // Full range-preview arrow.
    }
  });

  it('follows horizontally at35% when unclamped and presents both bases in overview without depending on hero x', () => {
    const follow = getBattleCamera(250);
    expect(screenX(250, follow)).toBeCloseTo(FIELD.width * .35);
    const left = getBattleCamera(FIELD.heroMinX, 'overview'), right = getBattleCamera(FIELD.heroMaxX, 'overview');
    expect(left).toEqual(right); expect(left.zoom).toBe(1); expect(left.worldView.x).toBe(0);
    expect(screenX(FIELD.humanBaseX, left)).toBeGreaterThan(0);
    expect(screenX(FIELD.aiBaseX, left)).toBeLessThan(FIELD.width);
    expect(getBattleCamera(NaN)).toEqual(getBattleCamera(FIELD.heroStartX));
  });

  it('scales logical bodies and knockback previews together without mutating combat state', () => {
    const session = new BattleSession({ runId: 1 }); const state = session.snapshot();
    const robot = { x: 300, kind: 'robot-melee' as const, bodyWidth: UNIT_DEFINITIONS['robot-melee'].bodyWidth };
    const boss = { x: 300, kind: 'gpt-4o' as const, bodyWidth: UNIT_DEFINITIONS['gpt-4o'].bodyWidth };
    for (const mode of ['close', 'overview'] as BattleViewMode[]) {
      const view = getBattleCamera(300, mode);
      for (const unit of [robot, boss]) {
        const displacement = screenX(getPushDestination(unit), view) - screenX(unit.x, view);
        expect(displacement / (unit.bodyWidth * view.zoom)).toBeCloseTo(unit.kind === 'gpt-4o' ? 1 : 3);
      }
    }
    expect(session.snapshot()).toEqual(state);
    expect(robot.bodyWidth).toBe(32); expect(boss.bodyWidth).toBe(64);
  });
});
