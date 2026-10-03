import { DEFAULT_STAGE } from '../battle/balance';
import type { StageDefinition, EnemyKind, SpawnEvent } from '../battle/types';

const waves = (count: number, first: number, interval: number) => Array.from({ length: count }, (_, index) => ({
  at: first + index * interval,
  kind: (index % 3 === 2 ? 'robot-ranged' : 'robot-melee') as EnemyKind,
}));
const rush = (at: number, count: number, interval = 0.45): SpawnEvent[] => Array.from({ length: count }, (_, index) => ({ at: at + index * interval, kind: 'robot-runner' }));
const ordered = (...groups: readonly SpawnEvent[][]): SpawnEvent[] => groups.flat().sort((a, b) => a.at - b.at);
export const STAGES: readonly StageDefinition[] = [
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
export const getStage = (id: string): StageDefinition | undefined => STAGES.find(stage => stage.id === id);
export const nextStage = (id: string): StageDefinition | undefined => { const index = STAGES.findIndex(stage => stage.id === id); return index < 0 ? undefined : STAGES[index + 1]; };
