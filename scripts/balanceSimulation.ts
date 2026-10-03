import { BattleSession } from '../src/game/BattleSession';
import { ALLY_KINDS, ALLY_UNLOCK_STAGES, ECONOMY, FORMATION_SIZE, SKILLS, STARTER_ALLIES, UNIT_DEFINITIONS } from '../src/game/battle/balance';
import { ProfileService, type ProfileSnapshot } from '../src/game/progression/ProfileService';
import { CHAPTER_ONE, CHAPTER_TWO, STAGES } from '../src/game/progression/stages';
import type { AllyKind, BattleCommand, CharacterKind, SkillKind, StageDefinition } from '../src/game/battle/types';

export type AuditPolicy = 'passive-pair' | 'melee-spam' | 'balanced' | 'priority-spam' | 'no-invest' | 'ranged-only';
export interface AuditOptions {
  stage: StageDefinition;
  policy: AuditPolicy;
  decisionSeconds?: number;
  budgetSeconds?: number;
  level?: number;
  profile?: ProfileSnapshot;
  skills?: readonly SkillKind[];
  reactionSeconds?: number;
  heroDistance?: number;
}
const roleCore: Record<string, AllyKind[]> = { '1-1': ['melee', 'ranged', 'support'], '1-2': ['melee', 'technician', 'ranged', 'support'], '1-3': ['melee', 'technician', 'ranged', 'judge', 'support'], '1-4': ['melee', 'technician', 'judge', 'firefighter', 'counselor'], '1-5': ['technician', 'athlete', 'judge', 'counselor', 'singer'], '2-1': ['technician', 'melee', 'firefighter', 'counselor', 'singer'], '2-2': ['technician', 'melee', 'judge', 'counselor', 'support'], '2-3': ['technician', 'athlete', 'judge', 'counselor', 'singer'], '2-4': ['technician', 'athlete', 'firefighter', 'counselor', 'singer'], '2-5': ['technician', 'athlete', 'judge', 'counselor', 'singer'] };
export const coreArmyForStage = (stageId: string, unlocked: readonly AllyKind[]) => (roleCore[stageId] ?? ['melee', 'ranged', 'support']).filter(kind => unlocked.includes(kind));
/** Fixed 0.1s world steps, with player decisions at .2/.5/1s. No writes to engine state. */
export function simulateBattle(options: AuditOptions) {
  const cadence = options.decisionSeconds ?? .5, budget = options.budgetSeconds ?? 240;
  const stageIndex = STAGES.findIndex(stage => stage.id === options.stage.id);
  const unlocked = options.profile?.unlockedAllies ?? ALLY_KINDS.filter(kind => STARTER_ALLIES.includes(kind) || STAGES.findIndex(stage => stage.id === ALLY_UNLOCK_STAGES[kind]) < stageIndex);
  const greedyArmy: AllyKind[] = ['melee', ...(unlocked.includes('technician') ? ['technician' as const] : []), 'ranged', ...(unlocked.includes('judge') ? ['judge' as const] : []), unlocked.includes('counselor') ? 'counselor' : 'support', ...(unlocked.includes('athlete') ? ['athlete' as const] : [])];
  const chosen: AllyKind[] = options.policy === 'passive-pair' ? ['melee', 'ranged'] : options.policy === 'melee-spam' ? ['melee'] : options.policy === 'ranged-only' ? ['ranged'] :
    options.policy === 'priority-spam' ? greedyArmy : options.profile ? options.profile.equippedAllies.filter((kind): kind is AllyKind => kind !== null) : coreArmyForStage(options.stage.id, unlocked);
  const equipped = (options.skills ?? options.profile?.equippedSkills ?? ['hello-world']).slice(0, 3);
  const ownedSkills = options.profile?.unlockedSkills ?? equipped;
  const levels = options.profile?.levels ?? Object.fromEntries((['hero', ...ALLY_KINDS] as CharacterKind[]).map(kind => [kind, options.level ?? 1]));
  const session = new BattleSession({ runId: 1, stage: options.stage, unlockedAllies: unlocked, equippedAllies: chosen, levels, unlockedSkills: ownedSkills, equippedSkills: equipped });
  const spend: Record<string, number> = {}, accepted: Record<string, number> = {};
  const command = (value: BattleCommand) => {
    const before = session.snapshot().gold;
    const result = session.dispatch(value);
    if (result.accepted && value.type !== 'move') {
      const key = value.type === 'summon' ? value.kind : value.type === 'skill' ? value.skill : value.type;
      spend[key] = (spend[key] ?? 0) + before - session.snapshot().gold;
      accepted[key] = (accepted[key] ?? 0) + 1;
    }
  };
  if (options.policy === 'passive-pair') { command({ type: 'summon', kind: 'melee' }); command({ type: 'summon', kind: 'ranged' }); }
  let nextDecision = 0, maxArmy = 0;
  for (let tick = 0; tick < budget * 10 && session.snapshot().status === 'active'; tick++) {
    const state = session.snapshot();
    maxArmy = Math.max(maxArmy, state.units.filter(unit => unit.team === 'human').length);
    if (options.policy !== 'passive-pair' && state.elapsed + 1e-8 >= nextDecision) {
      nextDecision += cadence;
      const enemies = state.units.filter(unit => unit.team === 'ai').sort((a, b) => a.x - b.x);
      const enemy = enemies[0];
      let destination = enemy ? Math.max(80, Math.min(465, enemy.x - (options.heroDistance ?? 140))) : 420;
      // This policy notices telegraphs only at the next human-like decision, never retroactively.
      const hazard = state.bossTelegraphs.find(zone => Math.abs(state.hero.x - zone.x) <= zone.radius + 12 && zone.duration - zone.remaining + 1e-8 >= (options.reactionSeconds ?? (cadence < .5 ? 0 : .5)));
      if (hazard) {
        const leftExit = hazard.x - hazard.radius - 16, rightExit = hazard.x + hazard.radius + 16;
        destination = leftExit >= 80 && (rightExit > 560 || state.hero.x - leftExit <= rightExit - state.hero.x) ? leftExit : rightExit;
      }
      command({ type: 'move', direction: Math.abs(destination - state.hero.x) < 5 ? 0 : destination > state.hero.x ? 1 : -1 });
      const invest = options.policy !== 'no-invest' && state.elapsed < 35 && state.economyLevel < 4 && (!enemy || enemy.x > 340);
      if (invest) command({ type: 'upgrade-economy' });
      // Investing is a finite opening, not unlimited future knowledge about all waves.
      if (!invest) {
        if (options.policy === 'balanced' || options.policy === 'no-invest') {
          // Reserve money for each missing role instead of spending it all on the first cheap unit.
          const tanks = chosen.filter(kind => kind === 'melee' || kind === 'technician' || kind === 'athlete');
          const backline = chosen.filter(kind => kind === 'ranged' || kind === 'judge' || kind === 'firefighter');
          const providers = chosen.filter(kind => kind === 'support' || kind === 'counselor' || kind === 'singer');
          const targets: Array<[AllyKind, number]> = [
            ...tanks.map(kind => [kind, kind === 'melee' ? 2 : 1] as [AllyKind, number]),
            ...backline.map(kind => [kind, 1] as [AllyKind, number]),
            ...providers.map(kind => [kind, 1] as [AllyKind, number]),
            ...tanks.map(kind => [kind, kind === 'melee' ? 4 : 2] as [AllyKind, number]),
            ...backline.map(kind => [kind, 3] as [AllyKind, number]),
          ];
          const missing = targets.find(([kind, desired]) => chosen.includes(kind) && state.units.filter(unit => unit.kind === kind && unit.team === 'human').length < desired);
          if (missing) command({ type: 'summon', kind: missing[0] });
        } else for (const kind of chosen) {
          const count = session.snapshot().units.filter(unit => unit.kind === kind && unit.team === 'human').length;
          if (kind === 'support' || kind === 'counselor' || kind === 'singer') { if (count >= 2) continue; }
          command({ type: 'summon', kind });
        }
        let current = session.snapshot();
        if (equipped.includes('heal') && current.hero.hp < current.hero.maxHp * .75) command({ type: 'skill', skill: 'heal' });
        current = session.snapshot();
        const sleepingTargets = enemies.filter(unit => unit.slowRemaining <= .1 && Math.abs(unit.x - current.hero.x) <= SKILLS.sleep.radius);
        if (equipped.includes('sleep') && sleepingTargets.length >= 2) command({ type: 'skill', skill: 'sleep' });
        const center = current.hero.x + SKILLS.foreach.forwardOffset;
        if (equipped.includes('foreach') && enemies.filter(unit => Math.abs(unit.x - center) <= SKILLS.foreach.radius).length >= 2) command({ type: 'skill', skill: 'foreach' });
        const closeEnemies = enemies.filter(unit => Math.abs(unit.x - current.hero.x) <= SKILLS['git-push'].radius);
        if (equipped.includes('git-push') && (closeEnemies.length >= 2 || state.bossTelegraphs.length > 0 && closeEnemies.some(unit => unit.kind === 'gpt-4o'))) command({ type: 'skill', skill: 'git-push' });
        current = session.snapshot();
        const cooling = Object.values(current.summonCooldowns).filter(value => value > 0).length + equipped.filter(kind => kind !== 'overclock' && current.skillCooldowns[kind] > 0).length;
        if (equipped.includes('overclock') && current.gold >= SKILLS.overclock.cost + 150 && cooling >= 2) command({ type: 'skill', skill: 'overclock' });
        if (equipped.includes('hello-world') && (enemy ? enemy.x > current.hero.x && enemy.x - current.hero.x < 340 : current.aiBase.x - current.hero.x < 340)) command({ type: 'skill', skill: 'hello-world' });
      }
    }
    session.step(.1);
  }
  const final = session.snapshot();
  const result = { stage: final.stageId, policy: options.policy, cadence, level: options.level ?? 'earned', skills: equipped,
    outcome: final.status === 'active' ? 'timeout' : final.status, seconds: Number(final.elapsed.toFixed(1)), heroHp: Number(final.hero.hp.toFixed(1)), heroMaxHp: final.hero.maxHp,
    baseHp: Number(final.humanBase.hp.toFixed(1)), enemyBaseHp: Number(final.aiBase.hp.toFixed(1)), bossDefeated: final.defeatedBossCount,
    goldSpent: Object.values(spend).reduce((total, amount) => total + amount, 0), goldLeft: Number(final.gold.toFixed(1)), economyLevel: final.economyLevel, maxArmy, spend, accepted };
  session.dispose(); return result;
}

export function simulateFreshCampaign(cadence: number, chapters = 2) {
  const profile = new ProfileService({ getItem: () => null, setItem: () => {} });
  const rounds = [];
  const purchases: Array<{ after: string; type: string; key: string; xp: number }> = [];
  const upgrade = (kind: CharacterKind, after: string) => { const before = profile.snapshot().xp; if (profile.upgrade(kind).accepted) purchases.push({ after, type: 'level', key: kind, xp: before - profile.snapshot().xp }); };
  const buy = (kind: SkillKind, after: string) => { const before = profile.snapshot().xp; if (profile.purchaseSkill(kind).accepted) purchases.push({ after, type: 'skill', key: kind, xp: before - profile.snapshot().xp }); };
  const route = chapters === 1 ? CHAPTER_ONE : STAGES;
  for (let index = 0; index < route.length; index++) {
    const stage = route[index], snapshot = profile.snapshot();
    const equippedSkills: SkillKind[] = ['hello-world', ...(snapshot.unlockedSkills.includes('heal') ? ['heal' as const] : []), ...(snapshot.unlockedSkills.includes('foreach') ? ['foreach' as const] : [])];
    profile.setEquippedSkills(equippedSkills);
    const army = coreArmyForStage(stage.id, snapshot.unlockedAllies);
    profile.setFormation([...army, ...Array<null>(FORMATION_SIZE - army.length).fill(null)]);
    const result = simulateBattle({ stage, policy: 'balanced', decisionSeconds: cadence, profile: profile.snapshot() });
    rounds.push({ ...result, xpBefore: snapshot.xp, earnedLevels: snapshot.levels });
    if (result.outcome !== 'won') break;
    profile.rewardWin(`fresh-${stage.id}`, stage.id);
    if (index === 0) { upgrade('hero', stage.id); upgrade('melee', stage.id); }
    if (index === 1) buy('heal', stage.id);
    if (index === 2) { upgrade('technician', stage.id); upgrade('ranged', stage.id); }
    if (index === 3) { buy('foreach', stage.id); upgrade('hero', stage.id); }
    if (index === 4 && chapters > 1) { upgrade('hero', stage.id); upgrade('hero', stage.id); upgrade('technician', stage.id); }
    if (index === 5) for (const kind of ['firefighter', 'ranged', 'judge', 'counselor', 'singer'] as CharacterKind[]) upgrade(kind, stage.id);
    if (index === 6) for (const kind of ['technician', 'judge', 'athlete', 'melee', 'firefighter'] as CharacterKind[]) upgrade(kind, stage.id);
    if (index === 7) for (const kind of ['hero', 'technician', 'judge', 'athlete'] as CharacterKind[]) upgrade(kind, stage.id);
    if (index === 8) for (const kind of ['firefighter', 'counselor', 'singer', 'hero'] as CharacterKind[]) upgrade(kind, stage.id);
  }
  const final = profile.snapshot(); profile.dispose();
  return { cadence, rounds, purchases, totalSeconds: Number(rounds.reduce((total, round) => total + round.seconds, 0).toFixed(1)), finalXp: final.xp, clears: final.clearedStages };
}

function roleEfficiency() {
  return ALLY_KINDS.map(kind => {
    const definition = UNIT_DEFINITIONS[kind], cost = definition.cost!;
    const observed = [1, 3].map(targetCount => {
      const definitions = structuredClone(UNIT_DEFINITIONS);
      definitions['robot-melee'] = { ...definitions['robot-melee'], hp: 100000, damage: 0, speed: 0 };
      const stage: StageDefinition = { id: 'benchmark', label: 'stationary durable targets', humanBaseHp: 900, aiBaseHp: 100000, initialGold: 400,
        spawns: Array.from({ length: targetCount }, () => ({ at: 0, kind: 'robot-melee' as const })) };
      const session = new BattleSession({ runId: 1, stage, unitDefinitions: definitions, unlockedAllies: ALLY_KINDS, equippedAllies: [kind] });
      session.dispatch({ type: 'summon', kind });
      let started: number | null = null, initialDamage = 0, total = 0;
      for (let tick = 0; tick < 1200 && (started === null || session.snapshot().elapsed < started + 30); tick++) {
        session.step(.1); const state = session.snapshot();
        total = state.units.filter(unit => unit.team === 'ai').reduce((sum, unit) => sum + unit.maxHp - unit.hp, 0);
        if (started === null && total > 0) { started = state.elapsed; initialDamage = total; }
        if (definition.damage === 0 && tick >= 10) break;
      }
      session.dispose();
      return { targets: targetCount, firstHitSeconds: started === null ? null : Number(started.toFixed(1)), dps30s: Number(((total - initialDamage) / 30).toFixed(2)) };
    });
    return { kind, hpPerGold: Number((definition.hp / cost).toFixed(2)), nominalDpsPer100Gold: Number((definition.damage / definition.attackInterval / cost * 100).toFixed(2)), observed };
  });
}

/** Controlled burst with a real bank, the same public setup and ordinary prices in both runs. */
export function simulateBankedBurst() {
  const run = (boosted: boolean) => {
    const definitions = structuredClone(UNIT_DEFINITIONS);
    definitions['robot-melee'] = { ...definitions['robot-melee'], hp: 100000, speed: 0, damage: 0 };
    const stage: StageDefinition = { id: 'banked-burst', label: 'controlled cooldown burst', humanBaseHp: 900, aiBaseHp: 100000, initialGold: 400, spawns: [{ at: 0, kind: 'robot-melee' }] };
    const army: AllyKind[] = ['melee', 'ranged', 'athlete', 'judge'];
    const session = new BattleSession({ runId: 1, stage, unitDefinitions: definitions, unlockedAllies: army, equippedAllies: army, unlockedSkills: ['hello-world', 'overclock'], equippedSkills: ['hello-world', 'overclock'] });
    session.dispatch({ type: 'move', direction: 1 }); session.step(260 / 86); session.dispatch({ type: 'move', direction: 0 });
    session.dispatch({ type: 'upgrade-economy' }); session.dispatch({ type: 'upgrade-economy' });
    while (session.snapshot().economyLevel < 4) { session.step(.5); session.dispatch({ type: 'upgrade-economy' }); }
    while (session.snapshot().gold < 1300) session.step(.5);
    const bank = session.snapshot().gold, counts: Record<string, number> = {}, initial = session.snapshot().units.find(unit => unit.team === 'ai')!.hp;
    const cast = (value: BattleCommand) => {
      if (!session.dispatch(value).accepted) return;
      const key = value.type === 'summon' ? value.kind : value.type === 'skill' ? value.skill : value.type;
      counts[key] = (counts[key] ?? 0) + 1;
    };
    for (const kind of army) cast({ type: 'summon', kind });
    cast({ type: 'skill', skill: 'hello-world' });
    if (boosted) cast({ type: 'skill', skill: 'overclock' });
    for (let tick = 0; tick < 100; tick++) {
      if (tick % 5 === 0) { for (const kind of army) cast({ type: 'summon', kind }); cast({ type: 'skill', skill: 'hello-world' }); }
      session.step(.1);
      if (session.snapshot().gold < -1e-8) throw Error('Negative burst funds');
    }
    const final = session.snapshot(), targetDamage = initial - final.units.filter(unit => unit.team === 'ai').reduce((sum, unit) => sum + unit.hp, 0);
    const result = { boosted, bankBefore: Number(bank.toFixed(1)), economyLevel: final.economyLevel, counts, totalActions: Object.values(counts).reduce((sum, count) => sum + count, 0), targetDamage: Number(targetDamage.toFixed(1)), goldLeft: Number(final.gold.toFixed(1)) };
    session.dispose(); return result;
  };
  return { durationGameSeconds: 10, method: 'Identical public setup earns level-4 economy and 1300+ bank. Enemy HP/speed/damage isolate a durable stationary target; no engine-state writes.', baseline: run(false), boosted: run(true) };
}

export function auditBalance() {
  const matrix = [];
  for (const stage of STAGES) for (const policy of ['passive-pair', 'melee-spam', 'priority-spam', 'balanced', 'no-invest', 'ranged-only'] as AuditPolicy[]) {
    matrix.push(simulateBattle({ stage, policy, level: 1, decisionSeconds: .5 }));
  }
  const skillAblations = [];
  for (const stage of STAGES.slice(1)) for (const skills of [['hello-world'], ['hello-world', 'heal'], ['hello-world', 'sleep'], ['hello-world', 'foreach'], ['hello-world', 'heal', 'foreach'], ['hello-world', 'heal', 'git-push'], ['hello-world', 'heal', 'overclock']] as SkillKind[][]) {
    skillAblations.push(simulateBattle({ stage, policy: 'balanced', level: 1, decisionSeconds: .5, skills }));
  }
  const utilityPosition = [['hello-world', 'heal'], ['hello-world', 'heal', 'sleep'], ['hello-world', 'heal', 'git-push']] .map(skills => simulateBattle({ stage: STAGES.find(stage => stage.id === '2-5')!, policy: 'balanced', level: 3, decisionSeconds: .5, heroDistance: 110, skills: skills as SkillKind[] }));
  const finalCadence = [.2, .5, 1].flatMap(cadence => [1, 3].map(level => simulateBattle({ stage: STAGES.find(stage => stage.id === '2-5')!, policy: 'balanced', level, decisionSeconds: cadence, skills: ['hello-world', 'heal'] })));
  return { version: 2, method: 'Public dispatch/step only; fixed .1 world step, player cadence .5 by default; .5s explicit telegraph reaction delay (.2s expert rows use zero delay); budget 240 game seconds. Skill ablations and fixed-level rows explicitly grant their listed loadout for comparison, not progression claims.',
    matrix, skillAblations, utilityPosition, finalCadence, freshCampaigns: [.5, 1].map(cadence => simulateFreshCampaign(cadence)), roleEfficiency: roleEfficiency(),
    bankedBurst: simulateBankedBurst(),
    economyPaybackSeconds: ECONOMY.slice(0, -1).map((row, index) => ({ fromLevel: index + 1, cost: row.upgradeCost, extraIncome: ECONOMY[index + 1].income - row.income, seconds: Number((row.upgradeCost! / (ECONOMY[index + 1].income - row.income)).toFixed(1)) })) };
}


/** Focused chapter extension evidence; the original five-stage audit artifacts remain immutable. */
export function auditChapters() {
  return { version: 2, method: 'Both chapters use real first-clear ProfileService rewards, purchases, levels and equipment. No replay receipts or private engine writes. Fixed .1s world step, .5/1s player decisions and .5s warning reaction; 240s stage budget. These are deterministic policy results, not a human playtime average.',
    chapterTwo: CHAPTER_TWO.map(stage => ({ id: stage.id, label: stage.label, aiBaseHp: stage.aiBaseHp, initialGold: stage.initialGold, reward: stage.clearReward, repeatInterval: stage.repeat?.interval, bossSpawnTimes: stage.spawns.filter(spawn => spawn.kind === 'gpt-4o').map(spawn => spawn.at) })),
    freshCampaigns: [.5, 1].map(cadence => simulateFreshCampaign(cadence)) };
}
