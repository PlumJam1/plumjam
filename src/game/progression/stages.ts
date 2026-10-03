import { DEFAULT_STAGE } from '../battle/balance';
import type { StageDefinition, EnemyKind, SpawnEvent } from '../battle/types';

const waves = (count: number, first: number, interval: number) => Array.from({ length: count }, (_, index) => ({
  at: first + index * interval,
  kind: (index % 3 === 2 ? 'robot-ranged' : 'robot-melee') as EnemyKind,
}));
const rush = (at: number, count: number, interval = 0.45): SpawnEvent[] => Array.from({ length: count }, (_, index) => ({ at: at + index * interval, kind: 'robot-runner' }));
const ordered = (...groups: readonly SpawnEvent[][]): SpawnEvent[] => groups.flat().sort((a, b) => a.at - b.at);
export const CHAPTER_ONE: readonly StageDefinition[] = [
  { ...DEFAULT_STAGE, clearReward: 120, theme: 'early' },
  { id: '1-2', label: '자동화 공고', humanBaseHp: 900, aiBaseHp: 950, initialGold: 180, clearReward: 160, theme: 'early',
    spawns: ordered(waves(7, 4, 6), rush(16, 3, .6)),
    waveNotices: [{ at: 14, label: '물량 공세! 저렴한 병력과 sleep()으로 막아봐.', duration: 4 }],
    repeat: { startAt: 46, interval: 7, kinds: ['robot-runner', 'robot-melee', 'robot-melee'] } },
  { id: '1-3', label: '퇴근 없는 거리', humanBaseHp: 900, aiBaseHp: 1150, initialGold: 200, clearReward: 200, theme: 'mid',
    spawns: waves(10, 3, 4).map((spawn, index) => ({ ...spawn, kind: index % 3 === 0 ? 'robot-melee' : 'robot-ranged' })),
    waveNotices: [{ at: 10, label: '원거리 압박! 튼튼한 전열 뒤에서 판결을 내려봐.', duration: 4 }],
    repeat: { startAt: 43, interval: 6, kinds: ['robot-melee', 'robot-ranged', 'robot-ranged'] } },
  { id: '1-4', label: '인간이 필요 없는 밤', humanBaseHp: 900, aiBaseHp: 1400, initialGold: 220, clearReward: 260, theme: 'mid',
    spawns: waves(12, 2, 3.5).map((spawn, index) => ({ ...spawn, kind: index % 4 === 2 ? 'robot-heavy' : spawn.kind })),
    waveNotices: [{ at: 7, label: '중장갑 로봇! 강한 단일 공격과 꾸준한 회복을 준비해.', duration: 5 }],
    repeat: { startAt: 44, interval: 6, kinds: ['robot-heavy', 'robot-ranged', 'robot-melee'] } },
  { id: '1-5', label: '너 정말 핵심을 짚었어', humanBaseHp: 900, aiBaseHp: 1700, initialGold: 260, clearReward: 360, theme: 'boss',
    spawns: ordered([{ at: 0, kind: 'gpt-4o' }], waves(16, 2, 2.5), rush(16, 3), [{ at: 24, kind: 'robot-heavy' }]),
    waveNotices: [{ at: 14, label: '보스 지원군 긴급 배포! 범위 공격과 돌진을 함께 조심해.', duration: 4 }],
    repeat: { startAt: 44, interval: 5, kinds: ['robot-melee', 'robot-ranged', 'robot-heavy', 'robot-runner'] } },
];
export const CHAPTER_TWO: readonly StageDefinition[] = [
  { id: '2-1', label: '긴급 배포의 아침', humanBaseHp: 900, aiBaseHp: 2100, initialGold: 260, clearReward: 400, theme: 'mid',
    spawns: ordered(waves(10, 2, 4.2), rush(3, 3, .5), rush(15, 5), rush(28, 6, .4)),
    waveNotices: [{ at: 13, label: '긴급 배포가 몰려와! 물분사와 foreach로 넓게 막아봐.', duration: 5 }, { at: 26, label: '다시 물량 공세! 전열을 유지하자.', duration: 5 }],
    repeat: { startAt: 44, interval: 4.6, kinds: ['robot-runner', 'robot-melee', 'robot-runner', 'robot-ranged'] } },
  { id: '2-2', label: '자동응답 콜센터', humanBaseHp: 900, aiBaseHp: 2400, initialGold: 280, clearReward: 440, theme: 'mid',
    spawns: ordered(waves(18, 2, 2.3).map((spawn, index) => ({ ...spawn, kind: index % 4 === 0 ? 'robot-melee' : 'robot-ranged' })), [{ at: 20, kind: 'robot-heavy' }, { at: 33, kind: 'robot-heavy' }]),
    waveNotices: [{ at: 10, label: '원거리 자동응답! 기술직으로 버티고 판결을 내려봐.', duration: 5 }],
    repeat: { startAt: 44, interval: 4.4, kinds: ['robot-melee', 'robot-ranged', 'robot-ranged'] } },
  { id: '2-3', label: '철벽 보안 게이트', humanBaseHp: 900, aiBaseHp: 2700, initialGold: 300, clearReward: 480, theme: 'boss',
    spawns: waves(18, 2, 2.2).map((spawn, index) => ({ ...spawn, kind: index % 3 === 1 ? 'robot-ranged' : 'robot-heavy' })),
    waveNotices: [{ at: 8, label: '중장갑 전열! 강한 단일 공격과 빠른 근접 병력이 필요해.', duration: 5 }],
    repeat: { startAt: 44, interval: 4.2, kinds: ['robot-heavy', 'robot-heavy', 'robot-ranged'] } },
  { id: '2-4', label: '무인 야간 관제실', humanBaseHp: 900, aiBaseHp: 3000, initialGold: 320, clearReward: 520, theme: 'boss',
    spawns: ordered(waves(20, 1.5, 2.1).map((spawn, index) => ({ ...spawn, kind: index % 4 === 0 ? 'robot-heavy' : spawn.kind })), rush(18, 4), rush(32, 4)),
    waveNotices: [{ at: 16, label: '혼합 증원! 회복과 노래 지원 뒤에서 싸우자.', duration: 5 }, { at: 30, label: '관제실 긴급 배포! 전열을 다시 채우자.', duration: 5 }],
    repeat: { startAt: 44, interval: 4, kinds: ['robot-heavy', 'robot-ranged', 'robot-runner', 'robot-melee'] } },
  { id: '2-5', label: '핵심을 두 번 짚었어', humanBaseHp: 900, aiBaseHp: 3400, initialGold: 340, clearReward: 650, theme: 'boss',
    spawns: ordered([{ at: 0, kind: 'gpt-4o' }, { at: 35, kind: 'gpt-4o' }], waves(18, 2, 2.3).map((spawn, index) => ({ ...spawn, kind: index % 5 === 0 ? 'robot-heavy' : spawn.kind })), rush(16, 4), rush(38, 4)),
    waveNotices: [{ at: 14, label: '보스의 첫 증원! 위험 구역을 비워두자.', duration: 5 }, { at: 32, label: 'GPT-4o 재등장 임박! 새 위험 구역도 따로 확인하자.', duration: 7 }],
    repeat: { startAt: 44, interval: 3.8, kinds: ['robot-heavy', 'robot-ranged', 'robot-runner', 'robot-melee'] } },
];
export const STAGES: readonly StageDefinition[] = [...CHAPTER_ONE, ...CHAPTER_TWO];
export const CHAPTERS = [
  { id: 1, label: '첫 출근', stages: CHAPTER_ONE },
  { id: 2, label: '두 번째 교대', stages: CHAPTER_TWO },
] as const;
export const getStage = (id: string): StageDefinition | undefined => STAGES.find(stage => stage.id === id);
export const nextStage = (id: string): StageDefinition | undefined => { const index = STAGES.findIndex(stage => stage.id === id); return index < 0 ? undefined : STAGES[index + 1]; };

export const getChapter = (stageId: string) => CHAPTERS.find(chapter => chapter.stages.some(stage => stage.id === stageId));
export const isBossStage = (stageId: string): boolean => !!getStage(stageId)?.spawns.some(spawn => spawn.kind === 'gpt-4o');
