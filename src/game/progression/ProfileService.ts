import type { CharacterKind, CommandResult, SkillKind } from '../battle/types';
import { DEFAULT_UNLOCKED_SKILLS, SKILLS, SKILL_UNLOCK_COSTS } from '../battle/balance';
import { getStage, STAGES } from './stages';

export const SAVE_KEY = 'plumjam.profile.v1';
export const MAX_LEVEL = 10;
export const CHARACTERS: readonly CharacterKind[] = ['hero', 'melee', 'ranged', 'support'];
export const levelMultiplier = (level: number): number => 1 + (level - 1) * 0.15;
export const upgradeCost = (level: number): number | null => level >= MAX_LEVEL ? null : 60 + (level - 1) * 30;
export interface ProfileData {
  version: 1;
  xp: number;
  levels: Record<CharacterKind, number>;
  clearedStages: string[];
  unlockedStages: string[];
  unlockedSkills: readonly SkillKind[];
  muted: boolean;
}
export interface ProfileSnapshot {
  readonly version: 1;
  readonly xp: number;
  readonly levels: Readonly<Record<CharacterKind, number>>;
  readonly clearedStages: readonly string[];
  readonly unlockedStages: readonly string[];
  readonly unlockedSkills: readonly SkillKind[];
  readonly muted: boolean;
  readonly storageMessage: string;
}
export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const fresh = (): ProfileData => ({ version: 1, xp: 0, levels: { hero: 1, melee: 1, ranged: 1, support: 1 }, clearedStages: [], unlockedStages: ['1-1'], unlockedSkills: [...DEFAULT_UNLOCKED_SKILLS], muted: false });
function parse(value: unknown): ProfileData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as ProfileData;
  if (data.version !== 1 || !Number.isSafeInteger(data.xp) || data.xp < 0 || !data.levels || typeof data.muted !== 'boolean') return null;
  if (CHARACTERS.some(kind => !Number.isInteger(data.levels[kind]) || data.levels[kind] < 1 || data.levels[kind] > MAX_LEVEL)) return null;
  if (!Array.isArray(data.clearedStages) || !Array.isArray(data.unlockedStages)) return null;
  // The optional field migrates existing v1 saves without discarding earned progress.
  if (data.unlockedSkills !== undefined && (!Array.isArray(data.unlockedSkills) || data.unlockedSkills.some(kind => !Object.hasOwn(SKILLS, kind)))) return null;
  const unlockedSkills = [...new Set([...DEFAULT_UNLOCKED_SKILLS, ...(data.unlockedSkills ?? [])])];
  const stageIds = STAGES.map(stage => stage.id);
  if ([...data.clearedStages, ...data.unlockedStages].some(id => !stageIds.includes(id))) return null;
  const cleared = [...new Set(data.clearedStages)];
  // Reject impossible progress instead of accepting hand-edited locks or silently resetting earned levels.
  if (cleared.some(id => stageIds.slice(0, stageIds.indexOf(id)).some(previous => !cleared.includes(previous)))) return null;
  const unlocked = stageIds.filter((_, index) => index === 0 || cleared.includes(stageIds[index - 1]));
  if (unlocked.length !== new Set(data.unlockedStages).size || unlocked.some(id => !data.unlockedStages.includes(id))) return null;
  return { version: 1, xp: data.xp, levels: { ...data.levels }, clearedStages: cleared, unlockedStages: unlocked, unlockedSkills, muted: data.muted };
}
/** Pure model; no Phaser/Vue objects. Win receipts live only within this browser app session. */
export class ProfileService {
  private data = fresh();
  private storageMessage = '';
  private readonly listeners = new Set<(snapshot: ProfileSnapshot) => void>();
  private readonly receipts = new Set<string>();
  constructor(private readonly storage?: SaveStorage) {
    if (!storage) { this.storageMessage = '저장을 사용할 수 없어. 이번 창을 닫으면 육성이 사라져.'; return; }
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (raw !== null) {
        const loaded = parse(JSON.parse(raw));
        if (loaded) this.data = loaded;
        else this.storageMessage = '저장 데이터 형식이 맞지 않아 새 육성으로 시작했어.';
      }
    } catch { this.storageMessage = '저장 데이터를 읽지 못했어. 이번 창에서는 계속 플레이할 수 있어.'; }
  }
  snapshot(): ProfileSnapshot { return Object.freeze({ ...this.data, levels: Object.freeze({ ...this.data.levels }), clearedStages: Object.freeze([...this.data.clearedStages]), unlockedStages: Object.freeze([...this.data.unlockedStages]), unlockedSkills: Object.freeze([...this.data.unlockedSkills]), storageMessage: this.storageMessage }); }
  subscribe(listener: (snapshot: ProfileSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }
  canStart(id: string): boolean { return !!getStage(id) && this.data.unlockedStages.includes(id); }
  rewardWin(receipt: string, stageId: string): number {
    const stage = getStage(stageId);
    if (!stage || !this.canStart(stageId) || this.receipts.has(receipt)) return 0;
    this.receipts.add(receipt);
    const reward = stage.clearReward ?? 0;
    this.data.xp += reward;
    if (!this.data.clearedStages.includes(stageId)) this.data.clearedStages.push(stageId);
    this.data.unlockedStages = STAGES.filter((_, index) => index === 0 || this.data.clearedStages.includes(STAGES[index - 1].id)).map(item => item.id);
    this.persist(); return reward;
  }
  upgrade(kind: CharacterKind): CommandResult {
    if (!CHARACTERS.includes(kind)) return { accepted: false, reason: '존재하지 않는 캐릭터야.' };
    const cost = upgradeCost(this.data.levels[kind]);
    if (cost === null) return { accepted: false, reason: '최대 레벨에 도달했어.' };
    if (this.data.xp < cost) return { accepted: false, reason: '육성 재화가 부족해.' };
    this.data.xp -= cost; this.data.levels[kind]++;
    this.persist(); return { accepted: true, reason: '강화했어! 다음 출근부터 적용돼.' };
  }
  purchaseSkill(kind: SkillKind): CommandResult {
    if (!Object.hasOwn(SKILL_UNLOCK_COSTS, kind)) return { accepted: false, reason: '상점에서 해금할 수 없는 스킬이야.' };
    if (this.data.unlockedSkills.includes(kind)) return { accepted: false, reason: '이미 해금한 스킬이야.' };
    const cost = SKILL_UNLOCK_COSTS[kind as keyof typeof SKILL_UNLOCK_COSTS];
    if (this.data.xp < cost) return { accepted: false, reason: '육성 재화가 부족해.' };
    this.data.xp -= cost;
    this.data.unlockedSkills = [...this.data.unlockedSkills, kind];
    this.persist(); return { accepted: true, reason: `${SKILLS[kind].label} 해금 완료! 다음 출근부터 사용할 수 있어.` };
  }
  setMuted(muted: boolean): void { this.data.muted = muted; this.persist(); }
  dispose(): void { this.listeners.clear(); this.receipts.clear(); }
  private persist(): void {
    if (this.storage) {
      try { this.storage.setItem(SAVE_KEY, JSON.stringify(this.data)); this.storageMessage = ''; }
      catch { this.storageMessage = '저장을 쓸 수 없어. 현재 육성은 이 창에서만 유지돼.'; }
    }
    for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener(this.snapshot());
  }
}
export function browserStorage(): SaveStorage | undefined { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
