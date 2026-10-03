import type { AllyKind, CharacterKind, CommandResult, SkillKind } from '../battle/types';
import { ALLY_KINDS, ALLY_UNLOCK_STAGES, FORMATION_SIZE, STARTER_ALLIES, DEFAULT_UNLOCKED_SKILLS, SKILLS, SKILL_UNLOCK_COSTS, SKILL_SLOT_COUNT } from '../battle/balance';
import { getStage, STAGES } from './stages';
import { getStory, isStoryUnlocked, type StoryId } from './story';

export const SAVE_KEY = 'plumjam.profile.v1';
export const MAX_LEVEL = 10;
export const CHARACTERS: readonly CharacterKind[] = ['hero', ...ALLY_KINDS];
export const levelMultiplier = (level: number): number => 1 + (level - 1) * 0.15;
export const upgradeCost = (level: number): number | null => level >= MAX_LEVEL ? null : 60 + (level - 1) * 30;
export interface ProfileData {
  version: 1;
  xp: number;
  levels: Record<CharacterKind, number>;
  clearedStages: string[];
  unlockedStages: string[];
  unlockedSkills: readonly SkillKind[];
  equippedSkills: readonly SkillKind[];
  unlockedAllies: readonly AllyKind[];
  equippedAllies: readonly (AllyKind | null)[];
  /** Optional in released v1 saves; story reading never grants campaign progress. */
  seenStoryIds?: readonly StoryId[];
  muted: boolean;
}
export interface ProfileSnapshot {
  readonly version: 1;
  readonly xp: number;
  readonly levels: Readonly<Record<CharacterKind, number>>;
  readonly clearedStages: readonly string[];
  readonly unlockedStages: readonly string[];
  readonly unlockedSkills: readonly SkillKind[];
  readonly equippedSkills: readonly SkillKind[];
  readonly unlockedAllies: readonly AllyKind[];
  readonly equippedAllies: readonly (AllyKind | null)[];
  readonly seenStoryIds: readonly StoryId[];
  readonly muted: boolean;
  readonly storageMessage: string;
}
export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const defaultFormation = (): (AllyKind | null)[] => [...STARTER_ALLIES, ...Array<null>(FORMATION_SIZE - STARTER_ALLIES.length).fill(null)];
const validFormation = (value: unknown, unlocked: readonly AllyKind[], size = FORMATION_SIZE): value is (AllyKind | null)[] => Array.isArray(value) && value.length === size && value.some(kind => kind !== null) && value.every(kind => kind === null || unlocked.includes(kind)) && new Set(value.filter(kind => kind !== null)).size === value.filter(kind => kind !== null).length;
const unlockedFor = (cleared: readonly string[]): AllyKind[] => ALLY_KINDS.filter(kind => STARTER_ALLIES.includes(kind) || !!ALLY_UNLOCK_STAGES[kind] && cleared.includes(ALLY_UNLOCK_STAGES[kind]!));
const fresh = (): ProfileData => ({ version: 1, xp: 0, levels: Object.fromEntries(CHARACTERS.map(kind => [kind, 1])) as Record<CharacterKind, number>, clearedStages: [], unlockedStages: ['1-1'], unlockedSkills: [...DEFAULT_UNLOCKED_SKILLS], equippedSkills: [...DEFAULT_UNLOCKED_SKILLS], unlockedAllies: [...STARTER_ALLIES], equippedAllies: defaultFormation(), seenStoryIds: [], muted: false });
function parse(value: unknown): ProfileData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as ProfileData;
  if (data.version !== 1 || !Number.isSafeInteger(data.xp) || data.xp < 0 || !data.levels || typeof data.muted !== 'boolean') return null;
  const levels = { ...data.levels };
  for (const kind of ALLY_KINDS.filter(kind => !STARTER_ALLIES.includes(kind))) if (levels[kind] === undefined) levels[kind] = 1;
  if (CHARACTERS.some(kind => !Number.isInteger(levels[kind]) || levels[kind] < 1 || levels[kind] > MAX_LEVEL)) return null;
  if (!Array.isArray(data.clearedStages) || !Array.isArray(data.unlockedStages)) return null;
  // The optional field migrates existing v1 saves without discarding earned progress.
  if (data.unlockedSkills !== undefined && (!Array.isArray(data.unlockedSkills) || data.unlockedSkills.some(kind => !Object.hasOwn(SKILLS, kind)))) return null;
  const legacySkills: SkillKind[] = ['hello-world', 'sleep', 'heal', 'overclock'];
  const unlockedSkills = [...new Set<SkillKind>(['hello-world', ...(data.unlockedSkills ?? legacySkills)])];
  const priority = (Object.keys(SKILLS) as SkillKind[]).filter(kind => unlockedSkills.includes(kind));
  // Repair only this optional loadout; earned XP, levels, ownership and campaign stay intact.
  const equippedSkills = Array.isArray(data.equippedSkills)
    ? [...new Set<SkillKind>(data.equippedSkills.filter(kind => unlockedSkills.includes(kind)))].slice(0, SKILL_SLOT_COUNT)
    : priority.slice(0, SKILL_SLOT_COUNT);
  const stageIds = STAGES.map(stage => stage.id);
  if ([...data.clearedStages, ...data.unlockedStages].some(id => !stageIds.includes(id))) return null;
  const cleared = [...new Set(data.clearedStages)];
  // Reject impossible progress instead of accepting hand-edited locks or silently resetting earned levels.
  if (cleared.some(id => stageIds.slice(0, stageIds.indexOf(id)).some(previous => !cleared.includes(previous)))) return null;
  const unlocked = stageIds.filter((_, index) => index === 0 || cleared.includes(stageIds[index - 1]));
  const savedUnlocked = [...new Set(data.unlockedStages)];
  const matchesCurrent = unlocked.length === savedUnlocked.length && unlocked.every(id => savedUnlocked.includes(id));
  // Only the released five-stage catalog may lack its newly appended frontier.
  // Partial/hand-edited saves still must match the complete derived unlock set.
  const legacyCatalog = ['1-1', '1-2', '1-3', '1-4', '1-5'];
  const completedLegacyCatalog = legacyCatalog.every((id, index) => stageIds[index] === id && cleared.includes(id) && savedUnlocked.includes(id))
    && cleared.length === legacyCatalog.length && savedUnlocked.length === legacyCatalog.length
    && unlocked.length === legacyCatalog.length + 1 && unlocked.at(-1) === '2-1';
  if (!matchesCurrent && !completedLegacyCatalog) return null;
  const unlockedAllies = unlockedFor(cleared);
  const savedFormation = data.equippedAllies;
  const equippedAllies = validFormation(savedFormation, unlockedAllies) ? [...savedFormation]
    : validFormation(savedFormation, unlockedAllies, 5) ? [...savedFormation, ...Array<null>(FORMATION_SIZE - 5).fill(null)]
    : defaultFormation();
  // Repair only this presentation history; malformed optional values cannot erase earned fields.
  const seenStoryIds: StoryId[] = [];
  if (Array.isArray(data.seenStoryIds)) for (const id of data.seenStoryIds) {
    const story = typeof id === 'string' ? getStory(id) : undefined;
    if (story && isStoryUnlocked(story, cleared) && !seenStoryIds.includes(story.id)) seenStoryIds.push(story.id);
  }
  return { version: 1, xp: data.xp, levels, clearedStages: cleared, unlockedStages: unlocked, unlockedSkills, equippedSkills, unlockedAllies, equippedAllies, seenStoryIds, muted: data.muted };
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
  snapshot(): ProfileSnapshot { return Object.freeze({ ...this.data, levels: Object.freeze({ ...this.data.levels }), clearedStages: Object.freeze([...this.data.clearedStages]), unlockedStages: Object.freeze([...this.data.unlockedStages]), unlockedSkills: Object.freeze([...this.data.unlockedSkills]), equippedSkills: Object.freeze([...this.data.equippedSkills]), unlockedAllies: Object.freeze([...this.data.unlockedAllies]), equippedAllies: Object.freeze([...this.data.equippedAllies]), seenStoryIds: Object.freeze([...(this.data.seenStoryIds ?? [])]), storageMessage: this.storageMessage }); }
  subscribe(listener: (snapshot: ProfileSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }
  canStart(id: string): boolean { return !!getStage(id) && this.data.unlockedStages.includes(id); }
  markStorySeen(id: StoryId): CommandResult {
    const story = getStory(id);
    if (!story) return { accepted: false, reason: '존재하지 않는 이야기야.' };
    if (!isStoryUnlocked(story, this.data.clearedStages)) return { accepted: false, reason: '해당 챕터를 클리어하면 읽을 수 있어.' };
    const seen = this.data.seenStoryIds ?? [];
    if (seen.includes(id)) return { accepted: true, reason: '이미 읽은 이야기야.' };
    this.data.seenStoryIds = [...seen, id];
    this.persist(); return { accepted: true, reason: '읽음으로 기록했어.' };
  }
  rewardWin(receipt: string, stageId: string): number {
    const stage = getStage(stageId);
    if (!stage || !this.canStart(stageId) || this.receipts.has(receipt)) return 0;
    this.receipts.add(receipt);
    const reward = stage.clearReward ?? 0;
    this.data.xp += reward;
    if (!this.data.clearedStages.includes(stageId)) this.data.clearedStages.push(stageId);
    this.data.unlockedStages = STAGES.filter((_, index) => index === 0 || this.data.clearedStages.includes(STAGES[index - 1].id)).map(item => item.id);
    this.data.unlockedAllies = unlockedFor(this.data.clearedStages);
    this.persist(); return reward;
  }
  upgrade(kind: CharacterKind): CommandResult {
    if (!CHARACTERS.includes(kind)) return { accepted: false, reason: '존재하지 않는 캐릭터야.' };
    if (kind !== 'hero' && !this.data.unlockedAllies.includes(kind)) return { accepted: false, reason: '아직 해금하지 않은 캐릭터야.' };
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
    this.persist(); return { accepted: true, reason: `${SKILLS[kind].label} 구매 완료! 장착한 뒤 출근해줘.` };
  }
  setEquippedSkills(skills: readonly SkillKind[]): CommandResult {
    if (!Array.isArray(skills) || skills.length > SKILL_SLOT_COUNT || new Set(skills).size !== skills.length || skills.some(kind => !this.data.unlockedSkills.includes(kind))) return { accepted: false, reason: '보유한 스킬을 중복 없이 최대 3개까지 장착할 수 있어.' };
    this.data.equippedSkills = [...skills];
    this.persist(); return { accepted: true, reason: '스킬 장착을 저장했어. 다음 출근부터 적용돼.' };
  }
  setFormation(formation: readonly (AllyKind | null)[]): CommandResult {
    if (!validFormation(formation, this.data.unlockedAllies)) return { accepted: false, reason: '편성은 중복 없이 10칸, 해금한 동료 최소 1명이 필요해.' };
    this.data.equippedAllies = [...formation];
    this.persist(); return { accepted: true, reason: '출전 편성을 저장했어.' };
  }
  setSlot(index: number, kind: AllyKind | null): CommandResult {
    if (!Number.isInteger(index) || index < 0 || index >= FORMATION_SIZE) return { accepted: false, reason: '없는 편성 칸이야.' };
    const next = [...this.data.equippedAllies];
    next[index] = kind;
    return this.setFormation(next);
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
