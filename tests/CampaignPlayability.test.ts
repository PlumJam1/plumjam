import { describe, expect, it } from 'vitest';
import { simulateBattle, simulateFreshCampaign, simulateBankedBurst } from '../scripts/balanceSimulation';
import { STAGES } from '../src/game/progression/stages';

describe('earned campaign playability with human-like decisions', () => {
  it.each([.5, 1])('clears without replay XP at %ss decisions and a half-second telegraph reaction', cadence => {
    const campaign = simulateFreshCampaign(cadence);
    expect(campaign.clears).toEqual(STAGES.map(stage => stage.id));
    expect(campaign.rounds).toHaveLength(5);
    for (const round of campaign.rounds) {
      expect(round.outcome, round.stage).toBe('won');
      expect(round.seconds).toBeLessThan(180);
      expect(round.heroHp).toBeGreaterThan(0);
      expect(round.baseHp).toBeGreaterThan(0);
      expect(round.goldLeft).toBeGreaterThanOrEqual(0);
      expect(round.earnedLevels.hero).toBeLessThanOrEqual(3);
    }
    expect(campaign.totalSeconds).toBeLessThan(720);
    // New late-game choices are genuinely affordable and deployed before the chapter ends.
    expect(campaign.rounds[3].accepted.firefighter).toBeGreaterThan(0);
    expect(campaign.rounds[4].accepted.singer).toBeGreaterThan(0);
    expect(campaign.rounds[4].accepted.foreach).toBeGreaterThan(0);
    expect(campaign.finalXp).toBe(390);
  });
  it('turns saved funds into more accepted burst actions without creating income or debt', () => {
    const result = simulateBankedBurst();
    expect(result.baseline.bankBefore).toBe(result.boosted.bankBefore);
    expect(result.baseline.economyLevel).toBe(4); expect(result.boosted.economyLevel).toBe(4);
    expect(result.boosted.counts.overclock).toBe(1);
    expect(result.boosted.totalActions).toBeGreaterThan(result.baseline.totalActions);
    expect(result.boosted.targetDamage).toBeGreaterThan(result.baseline.targetDamage);
    expect(result.baseline.goldLeft).toBeGreaterThanOrEqual(0); expect(result.boosted.goldLeft).toBeGreaterThanOrEqual(0);
  });
  it('supports the tutorial at level one but the final boss punishes the same cheap melee-only plan', () => {
    const tutorial = simulateBattle({ stage: STAGES[0], policy: 'balanced', level: 1, decisionSeconds: 1 });
    expect(tutorial.outcome).toBe('won'); expect(tutorial.heroHp).toBeGreaterThan(0);
    const inappropriate = simulateBattle({ stage: STAGES[4], policy: 'melee-spam', level: 1, decisionSeconds: 1 });
    expect(inappropriate.outcome).toBe('lost');
  });
});
