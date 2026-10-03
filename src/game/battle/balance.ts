import type { EconomyDefinition, StageDefinition, UnitDefinition, UnitKind } from './types';

export const FIELD = { width: 640, groundY: 230, humanBaseX: 55, aiBaseX: 585, humanSpawnX: 85, aiSpawnX: 550, heroStartX: 110, heroMinX: 80, heroMaxX: 560 } as const;
export const HERO = { hp: 320, speed: 86 } as const;
export const UNIT_DEFINITIONS: Record<UnitKind, UnitDefinition> = {
  melee: { label: '근접 회사원', team: 'human', hp: 180, damage: 23, speed: 24, range: 20, attackInterval: 1.1, cost: 60, summonCooldown: 3 },
  ranged: { label: '원거리 회사원', team: 'human', hp: 90, damage: 30, speed: 20, range: 105, attackInterval: 1.6, projectileSpeed: 170, cost: 110, summonCooldown: 5 },
  support: { label: '서비스직', team: 'human', hp: 100, damage: 0, speed: 20, range: 85, attackInterval: 5, cost: 140, summonCooldown: 8 },
  'robot-melee': { label: '생산성 로봇', team: 'ai', hp: 110, damage: 16, speed: 22, range: 20, attackInterval: 1.25 },
  'robot-ranged': { label: '자동화 로봇', team: 'ai', hp: 75, damage: 17, speed: 18, range: 95, attackInterval: 1.9, projectileSpeed: 145 },
  'gpt-4o': { label: 'GPT-4o', team: 'ai', hp: 1500, damage: 48, speed: 12, range: 125, attackInterval: 2.4, projectileSpeed: 130 },
};
export const ECONOMY: readonly EconomyDefinition[] = [
  { income: 18, cap: 400, upgradeCost: 130 },
  { income: 26, cap: 650, upgradeCost: 230 },
  { income: 36, cap: 1000, upgradeCost: 380 },
  { income: 48, cap: 1500, upgradeCost: null },
];
export const DEFAULT_STAGE: StageDefinition = {
  id: '1-1', label: '첫 출근', humanBaseHp: 900, aiBaseHp: 750, initialGold: 180,
  spawns: [
    { at: 5, kind: 'robot-melee' }, { at: 13, kind: 'robot-melee' },
    { at: 24, kind: 'robot-ranged' }, { at: 31, kind: 'robot-melee' },
  ],
  repeat: { startAt: 43, interval: 8, kinds: ['robot-melee', 'robot-melee', 'robot-ranged'] },
};
