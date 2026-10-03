import type { AllyKind, EconomyDefinition, SkillKind, StageDefinition, UnitDefinition, UnitKind } from './types';

export const ALLY_KINDS: readonly AllyKind[] = ['melee', 'ranged', 'support', 'technician', 'judge', 'counselor', 'athlete', 'firefighter', 'singer'];
export const STARTER_ALLIES: readonly AllyKind[] = ['melee', 'ranged', 'support'];
export const FORMATION_SIZE = 10;
export const FORMATION_PAGE_SIZE = 5;
export const ALLY_UNLOCK_STAGES: Partial<Record<AllyKind, string>> = { technician: '1-1', judge: '1-2', counselor: '1-3', athlete: '1-4', firefighter: '1-3', singer: '1-4' };
export const ALLY_ROLES: Record<AllyKind, { role: string; description: string; evolution: string }> = {
  melee: { role: '기본 탱커', description: '저렴한 서류가방 근접 공격', evolution: '시니어 좀비 회사원' },
  ranged: { role: '기본 딜러', description: '서류를 던지는 단일 원거리 공격', evolution: '시니어 원거리 회사원' },
  support: { role: '공격속도 지원', description: '주변 공격 유닛의 공격 준비 속도 ×1.3', evolution: '빨간 안경 서비스직' },
  technician: { role: '튼튼한 탱커', description: '높은 체력으로 버티는 느린 렌치 공격', evolution: '용접공' },
  judge: { role: '단일 딜러', description: '느리지만 강한 원거리 판결', evolution: '대법원장' },
  counselor: { role: '회복 지원', description: '주변 동료와 주인공의 체력 회복', evolution: '시니어 심리상담사' },
  athlete: { role: '근접 딜러', description: '빠른 발차기로 전선을 돌파', evolution: '태권도 선수' },
  firefighter: { role: '범위 딜러', description: '1초 동안 물분사 4틱 · 전방 적 모두 공격', evolution: '특수진화대원' },
  singer: { role: '공격·방어 지원', description: '아군 공격·방어 강화 · 적 공격력 약화', evolution: '월드스타' },
};
export const FIELD = { width: 640, height: 340, cameraY: -100, groundY: 230, humanBaseX: 55, aiBaseX: 585, humanSpawnX: 85, aiSpawnX: 550, heroStartX: 110, heroMinX: 80, heroMaxX: 560 } as const;
export const HERO = { hp: 320, speed: 86 } as const;
export const UNIT_DEFINITIONS: Record<UnitKind, UnitDefinition> = {
  melee: { label: '근접 회사원', team: 'human', bodyWidth: 32, hp: 160, damage: 20, speed: 24, range: 20, attackInterval: 1.1, cost: 60, summonCooldown: 3 },
  ranged: { label: '원거리 회사원', team: 'human', bodyWidth: 32, hp: 90, damage: 30, speed: 20, range: 105, attackInterval: 1.6, projectileSpeed: 170, cost: 110, summonCooldown: 5 },
  support: { label: '서비스직', team: 'human', bodyWidth: 32, hp: 100, damage: 0, speed: 20, range: 85, attackInterval: 5, cost: 100, summonCooldown: 8 },
  technician: { label: '기술직', team: 'human', bodyWidth: 36, hp: 520, damage: 42, speed: 18, range: 22, attackInterval: 2.2, cost: 150, summonCooldown: 7 },
  judge: { label: '판사', team: 'human', bodyWidth: 32, hp: 95, damage: 120, speed: 18, range: 130, attackInterval: 3.2, cost: 190, summonCooldown: 9 },
  counselor: { label: '심리상담사', team: 'human', bodyWidth: 32, hp: 120, damage: 0, speed: 20, range: 85, attackInterval: 5, cost: 125, summonCooldown: 8 },
  athlete: { label: '운동선수', team: 'human', bodyWidth: 32, hp: 260, damage: 32, speed: 34, range: 24, attackInterval: .7, cost: 160, summonCooldown: 5 },
  firefighter: { label: '소방관', team: 'human', bodyWidth: 32, hp: 220, damage: 60, speed: 20, range: 115, attackInterval: 2.2, cost: 200, summonCooldown: 8 },
  singer: { label: '가수', team: 'human', bodyWidth: 32, hp: 110, damage: 0, speed: 20, range: 85, attackInterval: 5, cost: 175, summonCooldown: 10 },
  'robot-heavy': { label: '중장갑 로봇', team: 'ai', bodyWidth: 42, hp: 340, damage: 28, speed: 12, range: 24, attackInterval: 2.1 },
  'robot-melee': { label: '생산성 로봇', team: 'ai', bodyWidth: 32, hp: 110, damage: 16, speed: 22, range: 20, attackInterval: 1.25 },
  'robot-ranged': { label: '자동화 로봇', team: 'ai', bodyWidth: 32, hp: 75, damage: 17, speed: 18, range: 95, attackInterval: 1.9, projectileSpeed: 145 },
  'robot-runner': { label: '긴급 배포 로봇', team: 'ai', bodyWidth: 28, hp: 60, damage: 12, speed: 52, range: 18, attackInterval: 1.1 },
  'gpt-4o': { label: 'GPT-4o', team: 'ai', bodyWidth: 64, hp: 1500, damage: 48, speed: 12, range: 125, attackInterval: 2.4, projectileSpeed: 130 },
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


/** The same battle gold funds every action. Durations and cooldowns use simulation seconds. */
export const SKILLS = {
  'hello-world': { label: 'Hello World', cost: 35, cooldown: 2.5, damage: 75, speed: 240, range: 350, description: '오른쪽 첫 적에게 발사 · 레벨에 따라 피해 증가' },
  sleep: { label: 'sleep()', cost: 55, cooldown: 10, radius: 120, duration: 5, speedMultiplier: 0.4, description: '주변 적 이동속도 -60% · 5초' },
  heal: { label: '보너스', cost: 80, cooldown: 12, radius: 110, amount: 70, description: '나와 주변 아군 회복 · 레벨에 따라 회복 증가' },
  'git-push': { label: 'git push', cost: 65, cooldown: 12, radius: 120, pushDuration: 0.45, description: '주변 적을 서서히 밀치기 · 일반 적 폭 ×3 · 보스 폭 ×1' },
  overclock: { label: 'overclock()', cost: 60, cooldown: 30, duration: 10, description: '10초간 소환·다른 스킬 준비 속도 ×2 · 수입 유지 · 자금 비축 후 사용' },
  foreach: { label: 'foreach()', cost: 100, cooldown: 12, damage: 95, radius: 90, forwardOffset: 180, flightDuration: .7, description: '전방 고정 범위 · 포물선 문구 착지 후 모든 적 유닛 1회 피해 · 기지 제외' },
} as const;
export const DEFAULT_UNLOCKED_SKILLS: readonly SkillKind[] = ['hello-world'];
export const SKILL_KEYS: Record<SkillKind, string> = { 'hello-world': 'J', sleep: 'K', heal: 'L', 'git-push': 'P', overclock: 'O', foreach: 'I' };
export const SKILL_SLOT_COUNT = 3;
export const SKILL_UNLOCK_COSTS = { sleep: 120, heal: 160, 'git-push': 240, overclock: 200, foreach: 220 } as const;
export const SUPPORT = {
  period: 5, radius: 100, heal: 35, duration: 7,
  hasteMultiplier: 1.3, damageMultiplier: 1.2, receivedDamageMultiplier: 0.85, speedMultiplier: 1.35,
} as const;
export const BOSS = { firstCastDelay: 6, cooldown: 9, windup: 1.4, forwardOffset: 100, radius: 80, damage: 80 } as const;
export const JUDGE = { windup: .25, fall: .35 } as const;
export const WATER = { duration: 1, tickInterval: .25, ticks: 4, extraReach: 75 } as const;
export const SONG = { period: 5, radius: 100, duration: 7, enemyDamageMultiplier: .85 } as const;
