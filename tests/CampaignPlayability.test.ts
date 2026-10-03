import { describe, expect, it } from 'vitest';
import { BattleSession } from '../src/game/BattleSession';
import { STAGES } from '../src/game/progression/stages';

describe('campaign playability with ordinary player commands', () => {
  it('can clear every authored stage at starter and evolved levels without changing model state', () => {
    for (const level of [1, 5]) for (const stage of STAGES) {
      let seed = 42;
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const session = new BattleSession({ runId: 1, stage, random,
        levels: { hero: level, melee: level, ranged: level, support: level } });
      for (let tick = 0; tick < 1800 && session.snapshot().status === 'active'; tick++) {
        let state = session.snapshot();
        const enemy = state.units.filter(unit => unit.team === 'ai').sort((a, b) => a.x - b.x)[0];
        let destination = enemy ? Math.max(80, Math.min(465, enemy.x - 140)) : 420;
        const hazard = state.bossTelegraphs.find(zone => Math.abs(state.hero.x - zone.x) <= zone.radius + 12);
        if (hazard) {
          const leftExit = hazard.x - hazard.radius - 16, rightExit = hazard.x + hazard.radius + 16;
          destination = leftExit >= 80 && (rightExit > 560 || state.hero.x - leftExit <= rightExit - state.hero.x) ? leftExit : rightExit;
        }
        session.dispatch({ type: 'move', direction: Math.abs(destination - state.hero.x) < 5 ? 0 : destination > state.hero.x ? 1 : -1 });
        if (state.elapsed < 35 && state.economyLevel < 4 && state.upgradeCost !== null && state.gold >= state.upgradeCost && (!enemy || enemy.x > 340)) {
          session.dispatch({ type: 'upgrade-economy' });
        }
        // Save for investment while the front is distant, then fund the army and skills.
        const saveForEconomy = state.elapsed < 35 && state.economyLevel < 4 && (!enemy || enemy.x > 340);
        if (!saveForEconomy) {
          session.dispatch({ type: 'summon', kind: 'melee' });
          session.dispatch({ type: 'summon', kind: 'ranged' });
          if (state.units.filter(unit => unit.kind === 'support').length < 2) session.dispatch({ type: 'summon', kind: 'support' });
          state = session.snapshot();
          if (enemy && enemy.x > state.hero.x && enemy.x - state.hero.x < 340) session.dispatch({ type: 'skill', skill: 'hello-world' });
          if (state.hero.hp < state.hero.maxHp * 0.7) session.dispatch({ type: 'skill', skill: 'heal' });
        }
        session.step(0.2);
        expect(session.snapshot().gold).toBeGreaterThanOrEqual(0);
      }
      expect(session.snapshot().status, `${stage.id}, level ${level}`).toBe('won');
      expect(session.snapshot().aiBase.hp).toBe(0);
      expect(session.snapshot().hero.hp).toBeGreaterThan(0);
      session.dispose();
    }
  });
});
