import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const outputFlag = process.argv.indexOf('--output');
const save = report => { const text = JSON.stringify(report, null, 2) + '\n';
  if (outputFlag >= 0 && process.argv[outputFlag + 1]) writeFileSync(process.argv[outputFlag + 1], text); else process.stdout.write(text); };
const supplemental = process.argv.includes('--supplement');
const head = '896af660eac6ca6b769afa670ffdb8b2f4dcdc94';
const hash = value => createHash('sha256').update(value).digest('hex');
const sourcePaths = ['src/game/BattleSession.ts', 'src/game/battle/balance.ts', 'src/game/progression/stages.ts', 'src/game/progression/ProfileService.ts', 'scripts/balanceSimulation.ts'];
// Candidate graphs use immutable pre-tuning commit blobs; the checkout is never changed.
const frozenSources = Object.fromEntries(sourcePaths.map(path => [path, execFileSync('git', ['show', `${head}:${path}`], { cwd: root, encoding: 'utf8' })]));
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, hash(frozenSources[path])]));
const candidates = [
  { id: 'A_team', hp: 220, range: 100, extra: 60, damage: 48 },
  { id: 'B_glass120', hp: 120, range: 85, extra: 30, damage: 48 },
  { id: 'C_glass110', hp: 110, range: 85, extra: 30, damage: 48 },
  { id: 'D_quarter12', hp: 120, range: 85, extra: 30, damage: 12 },
];
const focusStages = ['1-4', '2-1', '2-4'];
let baselineInputs;

// Add readonly snapshot metrics and capture inputs to the existing policy in memory.
// All decision rules, quotas, first-clear rewards and upgrade choices remain byte-for-byte.
function policyMetrics(code) {
  code = code.replace('let nextDecision = 0, maxArmy = 0;', `let nextDecision = 0, maxArmy = 0;
    const waterSamples: number[] = [], waterIds = new Set<number>(); let waterBaseChannels = 0, fireSeconds = 0, maxFire = 0;
    const observeWater = (value: ReturnType<BattleSession['snapshot']>) => {
      const fireCount = value.units.filter(unit => unit.kind === 'firefighter').length;
      maxFire = Math.max(maxFire, fireCount); fireSeconds += fireCount * .1;
      for (const channel of value.waterChannels) if (!waterIds.has(channel.id)) {
        waterIds.add(channel.id); const lo = Math.min(channel.x, channel.endX), hi = Math.max(channel.x, channel.endX);
        waterSamples.push(value.units.filter(unit => unit.team === 'ai' && unit.hp > 0 && unit.x >= lo && unit.x <= hi).length);
        if (value.aiBase.hp > 0 && value.aiBase.x >= lo && value.aiBase.x <= hi) waterBaseChannels++;
      }
    };`);
  code = code.replace('    session.step(.1);', '    observeWater(session.snapshot()); session.step(.1);');
  code = code.replace('maxArmy, spend, accepted };', `maxArmy, spend, accepted, water: { channels: waterSamples.length, meanEnemyTargets: Number((waterSamples.reduce((a,b)=>a+b,0) / (waterSamples.length || 1)).toFixed(3)), peakEnemyTargets: Math.max(0,...waterSamples), baseChannels: waterBaseChannels, fireUnitSeconds: Number(fireSeconds.toFixed(1)), maxFire } };`);
  code = code.replace('  const rounds = [];', '  const rounds = []; const inputProfiles: ProfileSnapshot[] = [];');
  code = code.replace('    const result = simulateBattle({ stage, policy:', '    inputProfiles.push(profile.snapshot());\n    const result = simulateBattle({ stage, policy:');
  code = code.replace('clears: final.clearedStages };', 'clears: final.clearedStages, inputProfiles };');
  return code;
}
const policySourceHash = hash(frozenSources['scripts/balanceSimulation.ts']);
const measuredPolicyHash = hash(policyMetrics(frozenSources['scripts/balanceSimulation.ts']));

async function isolated(candidate) {
  let balanceTransformCount = 0;
  const server = await createServer({ root, configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    plugins: [{ name: 'temporary-firefighter-comparison', enforce: 'pre', transform(code, id) {
      const path = id.split('?')[0];
      const relative = path.startsWith(root + '/') ? path.slice(root.length + 1) : '';
      if (frozenSources[relative]) code = frozenSources[relative];
      if (path === `${root}/src/game/battle/balance.ts`) {
        const line = code.match(/  firefighter: \{ label: '소방관',[^\n]+\},/)?.[0];
        assert(line?.includes('hp: 220') && line.includes('damage: 48') && line.includes('range: 100') && line.includes('attackInterval: 2.75'));
        const next = line.replace('hp: 220', `hp: ${candidate.hp}`).replace('damage: 48', `damage: ${candidate.damage}`).replace('range: 100', `range: ${candidate.range}`);
        assert(code.includes('extraReach: 60'));
        balanceTransformCount++;
        return { code: code.replace(line, next).replace('extraReach: 60', `extraReach: ${candidate.extra}`), map: null };
      }
      if (path === `${root}/scripts/balanceSimulation.ts`) return { code: policyMetrics(supplemental ? fixedRoleMetrics(code) : code), map: null };
      if (frozenSources[relative]) return { code, map: null };
    } }] });
  try {
    const balance = await server.ssrLoadModule('/src/game/battle/balance.ts');
    const { BattleSession } = await server.ssrLoadModule('/src/game/BattleSession.ts');
    const { ProfileService } = await server.ssrLoadModule('/src/game/progression/ProfileService.ts');
    const { STAGES } = await server.ssrLoadModule('/src/game/progression/stages.ts');
    const harness = await server.ssrLoadModule('/scripts/balanceSimulation.ts');
    const actual = balance.UNIT_DEFINITIONS.firefighter;
    assert.equal(actual.hp, candidate.hp); assert.equal(actual.damage, candidate.damage); assert.equal(actual.range, candidate.range);
    assert.equal(actual.attackInterval, 2.75); assert.equal(actual.cost, 200); assert.equal(actual.summonCooldown, 8);
    assert.equal(balance.WATER.extraReach, candidate.extra); assert.deepEqual(balance.ATHLETE, { knockback: 20, knockbackDuration: .15 });
    assert.equal(balance.UNIT_DEFINITIONS.athlete.cost, 180); assert.equal(balanceTransformCount, 1);
    return { server, balance, BattleSession, ProfileService, STAGES, harness, actual };
  } catch (error) { await server.close(); throw error; }
}

function loadedProfile(modules, data, replaceFire) {
  const model = new modules.ProfileService({ getItem: () => JSON.stringify(data), setItem: () => {} });
  assert.equal(model.snapshot().storageMessage, '');
  if (replaceFire !== undefined) {
    const formation = data.equippedAllies.map(kind => kind === 'firefighter' ? replaceFire : kind);
    assert(model.setFormation(formation).accepted);
  }
  return model.snapshot();
}
const summary = result => ({ stage: result.stage, outcome: result.outcome, seconds: result.seconds, heroHp: result.heroHp,
  enemyBaseHp: result.enemyBaseHp, goldSpent: result.goldSpent, fireSummons: result.accepted.firefighter ?? 0,
  fireSpend: result.spend.firefighter ?? 0, water: result.water });

function nativeSpace(modules) {
  const { BattleSession, balance } = modules;
  const definitions = structuredClone(balance.UNIT_DEFINITIONS);
  definitions.melee = { ...definitions.melee, hp: 100000, damage: 0 };
  for (const kind of ['robot-melee', 'robot-ranged']) definitions[kind] = { ...definitions[kind], hp: 100000, damage: 0 };
  const battle = new BattleSession({ runId: 1, random: () => .42, unitDefinitions: definitions,
    stage: { id: 'native-space', label: 'public native engagement', humanBaseHp: 900, aiBaseHp: 900, initialGold: 400,
      spawns: [{ at: 0, kind: 'robot-melee' }, { at: 10, kind: 'robot-ranged' }] },
    unlockedAllies: ['melee', 'firefighter'], equippedAllies: ['melee', 'firefighter'] });
  battle.dispatch({ type: 'summon', kind: 'melee' }); battle.dispatch({ type: 'summon', kind: 'firefighter' });
  let initial;
  for (let tick = 0; tick < 40 * 60; tick++) { battle.step(1 / 60); const state = battle.snapshot();
    if (state.elapsed > 18 && state.waterChannels[0]?.remaining === balance.WATER.duration) { initial = state; break; } }
  assert(initial);
  const source = initial.units.find(unit => unit.kind === 'firefighter');
  const front = initial.units.find(unit => unit.kind === 'robot-melee'), rear = initial.units.find(unit => unit.kind === 'robot-ranged');
  assert(Math.abs(rear.x - front.x - 75) < 1e-6);
  const ticks = [];
  for (let tick = 1; tick <= 4; tick++) { battle.step(.25); const state = battle.snapshot();
    ticks.push({ tick, frontDamage: front.hp - state.units.find(unit => unit.id === front.id).hp, rearDamage: rear.hp - state.units.find(unit => unit.id === rear.id).hp }); }
  const result = { method: 'Damage/HP overridden only to isolate water; all travel speeds/ranges native. Public summons and steps.',
    at: initial.elapsed, sourceX: source.x, frontX: front.x, rearX: rear.x, separation: rear.x - front.x,
    endX: initial.waterChannels[0].endX, ticks };
  battle.dispose(); return result;
}

function isolatedClusterAndBase(modules) {
  const { balance, BattleSession } = modules;
  const definitions = structuredClone(balance.UNIT_DEFINITIONS);
  // Stationary durable opponents isolate per-target tick multiplicity; this is not a natural-wave claim.
  definitions['robot-melee'] = { ...definitions['robot-melee'], hp: 100000, damage: 0, speed: 0 };
  const battle = new BattleSession({ runId: 1, unitDefinitions: definitions,
    stage: { id: 'cluster-base', label: 'isolated water ticks', initialGold: 400, humanBaseHp: 900, aiBaseHp: 100000,
      spawns: [0, 1, 2].map(() => ({ at: 0, kind: 'robot-melee' })) },
    unlockedAllies: ['firefighter'], equippedAllies: ['firefighter'] });
  battle.dispatch({ type: 'summon', kind: 'firefighter' });
  let initial;
  for (let tick = 0; tick < 40 * 60; tick++) { battle.step(1 / 60); const state = battle.snapshot(); if (state.waterChannels[0]?.remaining === 1) { initial = state; break; } }
  assert(initial); const source = initial.units.find(unit => unit.kind === 'firefighter');
  const targets = initial.units.filter(unit => unit.team === 'ai'); const ticks = [];
  for (let tick = 1; tick <= 4; tick++) { battle.step(.25); const state = battle.snapshot(); ticks.push({ tick,
    targetDamages: targets.map(unit => unit.hp - state.units.find(now => now.id === unit.id).hp), baseDamage: initial.aiBase.hp - state.aiBase.hp }); }
  const result = { method: 'Stationary durable co-located targets at real spawnX550; no HP/x/gold state mutation.', sourceX: source.x,
    frontX: targets[0].x, baseX: initial.aiBase.x, endX: initial.waterChannels[0].endX, ticks };
  battle.dispose(); return result;
}

function fixedRoleMetrics(code){return code.replace('  heroDistance?: number;','  heroDistance?: number; fixedDamageRole?: AllyKind;').replace("const tanks = chosen.filter(kind => kind === 'melee' || kind === 'technician' || kind === 'athlete');","const tanks = options.fixedDamageRole ? chosen.filter(kind=>kind==='technician') : chosen.filter(kind => kind === 'melee' || kind === 'technician' || kind === 'athlete');").replace("const backline = chosen.filter(kind => kind === 'ranged' || kind === 'judge' || kind === 'firefighter');","const backline = options.fixedDamageRole ? chosen.filter(kind=>kind===options.fixedDamageRole) : chosen.filter(kind => kind === 'ranged' || kind === 'judge' || kind === 'firefighter');");}

function earned(modules, through, focus = false) {
  const profile = new modules.ProfileService({ getItem: () => null, setItem: () => {} });
  for (const stage of modules.STAGES.slice(0, through)) assert.equal(profile.rewardWin(stage.id, stage.id), stage.clearReward);
  assert(profile.upgrade('hero').accepted);
  if (focus) for (let i = 0; i < 4; i++) assert(profile.upgrade('firefighter').accepted);
  return profile;
}
function formation(profile, list, size) { assert(profile.setFormation([...list,...Array(size-list.length).fill(null)]).accepted); }
function naturalRole(modules, role) {
  const profile = earned(modules, 5); assert(profile.setEquippedSkills([]).accepted);
  formation(profile, ['technician', role, 'support', 'counselor'], modules.balance.FORMATION_SIZE);
  const state = profile.snapshot();
  assert.equal(state.levels.hero, 2);
  for (const kind of ['melee','ranged','judge','firefighter','technician','support','counselor']) assert.equal(state.levels[kind],1);
  const result = modules.harness.simulateBattle({ stage: modules.STAGES.find(stage=>stage.id==='2-1'), policy:'balanced', decisionSeconds:.5,
    profile:state, fixedDamageRole:role });
  return { role, profileHash:hash(JSON.stringify(state)), method:'Native 2-1 waves. All allies Lv1/Hero2, no hero spells. Identical finite quota: tech1/2, role1/3, support1, counselor1. Same movement/invest/reaction policy; real earned Profile APIs.',
    ...summary(result), roleSummons:result.accepted[role]??0, roleSpend:result.spend[role]??0, maxArmy:result.maxArmy };
}
function focusedFire(modules, noFire = false) {
  const profile=earned(modules,3,true); assert.equal(profile.snapshot().xp,0); assert.equal(profile.snapshot().levels.firefighter,5);
  formation(profile,['melee','technician',...(noFire?[]:['firefighter']),'counselor','ranged'],modules.balance.FORMATION_SIZE);
  const state=profile.snapshot();assert.deepEqual(state.equippedSkills,['hello-world']);
  const result=modules.harness.simulateBattle({stage:modules.STAGES.find(stage=>stage.id==='1-4'),policy:'balanced',decisionSeconds:.5,profile:state});
  return {method:'First three stages give480XP; fire Lv5 costs420 and Hero2 costs60. Other allies Lv1, Hello only. Same five-role army/policy; no-fire ablation removes only fire.',
    profileHash:hash(JSON.stringify(state)),xp:state.xp,levels:state.levels,...summary(result),maxArmy:result.maxArmy};
}
function solo(modules) {
  const {BattleSession,balance}=modules;
  const battle=new BattleSession({runId:1,random:()=>.42,
    stage:{id:'solo-fire',label:'Unprotected fire against four native ranged enemies',initialGold:200,humanBaseHp:900,aiBaseHp:900,
      spawns:[0,.5,1,1.5].map(at=>({at,kind:'robot-ranged'}))},
    unlockedAllies:['firefighter'],equippedAllies:['firefighter'],equippedSkills:[]});
  assert(battle.dispatch({type:'move',direction:-1}).accepted);battle.step(.4);battle.dispatch({type:'move',direction:0});
  assert.equal(battle.snapshot().hero.x,80);assert(battle.dispatch({type:'summon',kind:'firefighter'}).accepted);
  let sourceId,sourceDeath=null,totalEnemyDamage=0,channelCount=0,canceledTicks=0,lastChannel,previous;
  const ids=new Set();
  for(let i=0;i<60*60;i++) {
    const before=battle.snapshot();const fire=before.units.find(u=>u.kind==='firefighter');sourceId??=fire?.id;
    for(const c of before.waterChannels)if(!ids.has(c.id)){ids.add(c.id);channelCount++;}
    lastChannel=before.waterChannels.find(c=>c.ownerId===sourceId)??before.waterChannels[0];
    previous=new Map(before.units.filter(u=>u.team==='ai').map(u=>[u.id,u.hp]));
    battle.step(1/60);const now=battle.snapshot();
    for(const [id,hp] of previous){const target=now.units.find(u=>u.id===id);totalEnemyDamage+=hp-(target?.hp??0);}
    if(sourceId&&!now.units.some(u=>u.id===sourceId)){
      sourceDeath=now.elapsed;
      // Snapshot remaining tracks the pending final ticks; death itself cannot resolve one.
      if(lastChannel)canceledTicks=Math.ceil((lastChannel.remaining-1e-8)/balance.WATER.tickInterval);
      assert.equal(now.waterChannels.length,0);break;
    }
    if(now.status!=='active')break;
  }
  const now=battle.snapshot();const result={method:'Public move to hero80, summon one Lv1 fire for200 gold, no spells/invest/other allies. Four unchanged native ranged enemies (HP75/D17/range95/speed18) at0/.5/1/1.5s. No HP/x/gold state writes.',
    spawnCadence:.5,sourceDeath:sourceDeath===null?null:Number(sourceDeath.toFixed(3)),channelCount,canceledTicks,enemyAlive:now.units.filter(u=>u.team==='ai').length,
    sumEnemyDamage:Number(totalEnemyDamage.toFixed(3)),heroHp:now.hero.hp,sourceHp:now.units.find(u=>u.id===sourceId)?.hp??0,elapsed:Number(now.elapsed.toFixed(3)),
    config:{firefighter:balance.UNIT_DEFINITIONS.firefighter,WATER:balance.WATER,opponent:balance.UNIT_DEFINITIONS['robot-ranged']}};
  battle.dispose();return result;
}
if (process.argv.includes('--current')) {
  const server=await createServer({root,configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false,watch:null}});
  try {
    const {simulateFreshCampaign}=await server.ssrLoadModule('/scripts/balanceSimulation.ts');
    const balance=await server.ssrLoadModule('/src/game/battle/balance.ts');
    const currentHashes=Object.fromEntries(sourcePaths.map(path=>[path,hash(readFileSync(`${root}/${path}`))]));
    const campaigns=[.5,1].map(cadence=>simulateFreshCampaign(cadence));
    assert(campaigns.every(route=>route.clears.length===10&&route.rounds.every(round=>round.outcome==='won')));
    save({referenceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),productWorkingTree:true,sourceHashes:currentHashes,
      method:'Current production graph including C tuning and Athlete pending endpoint preservation; unchanged public earned Profile policy, no replay grind.',
      config:{firefighter:balance.UNIT_DEFINITIONS.firefighter,WATER:balance.WATER,ATHLETE:balance.ATHLETE},campaigns});
  } finally {await server.close();}
  process.exit(0);
}

if (supplemental) {
const reports=[];
for(const candidate of candidates){const m=await isolated(candidate);try{
  const roles=candidate.id==='A_team'?['melee','ranged','judge','firefighter']:['firefighter'];
  reports.push({candidate,configVerified:{firefighter:m.actual,WATER:m.balance.WATER,ATHLETE:m.balance.ATHLETE},roles:roles.map(role=>naturalRole(m,role)),focused:focusedFire(m),focusedNoFire:focusedFire(m,true),
    ...(['A_team','C_glass110'].includes(candidate.id)?{solo:solo(m)}:{})});
}finally{await m.server.close();}}
save({head,sourceHashes,method:'Frozen git896af66 modules before Athlete pending endpoint preservation fix. Public Profile earned roles/focus and native unprotected cohort; fixed damage-role policy documented per result.',candidates:reports});

} else {
const allResults = [];
for (const candidate of candidates) {
  const modules = await isolated(candidate);
  try {
    const fresh = [.5, 1].map(cadence => {
      const result = modules.harness.simulateFreshCampaign(cadence);
      if (candidate.id === 'A_team' && cadence === .5) baselineInputs = result.inputProfiles;
      return { cadence, clears: result.clears, totalSeconds: result.totalSeconds, finalXp: result.finalXp,
        purchases: result.purchases, rounds: result.rounds.map(summary) };
    });
    assert.equal(baselineInputs.length, 10, 'Current team baseline must supply ten genuinely earned input profiles');
    const fixed = modules.STAGES.map((stage, index) => summary(modules.harness.simulateBattle({ stage, policy: 'balanced', decisionSeconds: .5,
      profile: loadedProfile(modules, baselineInputs[index]) })));
    const ablations = [];
    for (const id of focusStages) {
      const index = modules.STAGES.findIndex(stage => stage.id === id), stage = modules.STAGES[index];
      ablations.push({ stage: id, noFire: summary(modules.harness.simulateBattle({ stage, policy: 'balanced', decisionSeconds: .5,
        profile: loadedProfile(modules, baselineInputs[index], null) })), rangedReplacement: summary(modules.harness.simulateBattle({ stage, policy: 'balanced', decisionSeconds: .5,
        profile: loadedProfile(modules, baselineInputs[index], 'ranged') })) });
    }
    const result = { candidate, configVerified: { firefighter: modules.actual, WATER: modules.balance.WATER, ATHLETE: modules.balance.ATHLETE,
      athleteCost: modules.balance.UNIT_DEFINITIONS.athlete.cost }, fresh, fixed, ablations,
      nativeSpace: nativeSpace(modules), clusterAndBase: isolatedClusterAndBase(modules) };
    allResults.push(result);
    console.error(JSON.stringify({ id: candidate.id, fresh: fresh.map(route => ({ cadence: route.cadence, count: route.clears.length, seconds: route.totalSeconds })),
      fixedFocus: fixed.filter(row => focusStages.includes(row.stage)).map(row => ({ stage: row.stage, status: row.outcome, seconds: row.seconds, fireCount: row.fireSummons, targets: row.water.meanEnemyTargets, baseCasts: row.water.baseChannels })),
      space: result.nativeSpace.ticks.at(-1), base: result.clusterAndBase.ticks.at(-1) }));
  } finally { await modules.server.close(); }
}

save({head, sourceHashes, policySourceHash, measuredPolicyHash, method: 'Frozen git896af66 SSR graphs before Athlete pending endpoint preservation fix; scalar candidate changes only. Public Profile earned campaign and same baseline-earned inputs for fixed comparisons. Native geometry and isolated durable cluster are labelled separately.', baselineInputHashes: baselineInputs.map(data => hash(JSON.stringify(data))), candidates: allResults });

}
