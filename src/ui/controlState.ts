import type { BattleStatus } from '../game/battle/types';

export type ControlStatus = 'loading' | 'ready' | 'cooldown' | 'funds' | 'empty' | 'paused' | 'ended' | 'locked' | 'unequipped' | 'max';
export interface ControlState { status: ControlStatus; reason: string; statusLabel: string; disabled: boolean }
export interface ControlInput {
  battle: { status: BattleStatus; gold: number } | null;
  cost: number;
  cooldown?: number;
  empty?: boolean;
  unlocked?: boolean;
  equipped?: boolean;
  max?: boolean;
}
/** Presentation only: the battle model still approves and charges every action. */
export function controlState(input: ControlInput): ControlState {
  const state = (status: ControlStatus, reason: string, statusLabel = reason): ControlState => ({ status, reason, statusLabel, disabled: status !== 'ready' });
  if (input.empty) return state('empty', '준비실에서 편성', '빈 칸');
  if (!input.battle) return state('loading', '전투 준비 중', '준비 중');
  if (input.unlocked === false) return state('locked', '상점에서 구매', '구매 필요');
  if (input.equipped === false) return state('unequipped', '장착 필요');
  if (input.battle.status !== 'active') return input.battle.status === 'paused' ? state('paused', '일시정지') : state('ended', '전투 종료');
  if (input.max) return state('max', '최대 레벨', 'MAX');
  if ((input.cooldown ?? 0) > 0) return state('cooldown', `준비 ${input.cooldown!.toFixed(1)}초`, `${input.cooldown!.toFixed(1)}초`);
  if (input.battle.gold < input.cost) return state('funds', `자금 ${Math.ceil(input.cost - input.battle.gold)} 부족`, `${Math.ceil(input.cost - input.battle.gold)}원 부족`);
  return state('ready', '사용 가능', '준비 완료');
}
