import { describe, expect, it, vi } from 'vitest';
import { ProfileService, SAVE_KEY, type SaveStorage } from '../src/game/progression/ProfileService';
import { STORIES, getStory, isStoryUnlocked, unlockedStories, type StoryId } from '../src/game/progression/story';
import { GENERATED_ASSETS } from '../src/game/presentation/assets';
import { STAGES } from '../src/game/progression/stages';

function memoryStorage(initial?: unknown): SaveStorage {
  let saved = initial === undefined ? null : JSON.stringify(initial);
  return { getItem: key => key === SAVE_KEY ? saved : null, setItem: (_key, value) => { saved = value; } };
}
function earnedProfile() {
  const profile = new ProfileService(memoryStorage());
  for (const stage of STAGES.slice(0, 5)) profile.rewardWin(stage.id, stage.id);
  profile.upgrade('hero'); profile.upgrade('technician'); profile.purchaseSkill('foreach');
  profile.setEquippedSkills(['hello-world', 'foreach']);
  profile.setFormation(['technician', 'judge', 'counselor', 'firefighter', 'singer', 'melee', 'ranged', 'support', 'athlete', null]);
  profile.setMuted(true);
  return profile.snapshot();
}

describe('original story catalog and actual clear eligibility', () => {
  it('contains thirteen compact original pages using only existing backgrounds and portrait keys', () => {
    expect(STORIES.map(story => story.id)).toEqual(['prologue', 'chapter-1', 'chapter-2']);
    expect(STORIES.map(story => story.pages.length)).toEqual([4, 4, 5]);
    for (const story of STORIES) for (const page of story.pages) {
      expect(page.title.trim()).not.toBe(''); expect(page.body).toHaveLength(3);
      expect(page.body.join('').length).toBeGreaterThanOrEqual(90);
      expect(page.body.join('').length).toBeLessThanOrEqual(150);
      expect(GENERATED_ASSETS).toContain(page.background);
      expect(page.portraits.length).toBeGreaterThan(0);
      for (const portrait of page.portraits) expect(GENERATED_ASSETS).toContain(portrait);
    }
    expect(getStory('missing')).toBeUndefined(); expect(getStory('toString')).toBeUndefined();
  });
  it('makes prologue free, and requires the corresponding completed boss stage for each aftermath', () => {
    const first = getStory('chapter-1')!, last = getStory('chapter-2')!;
    expect(isStoryUnlocked(getStory('prologue')!, [])).toBe(true);
    expect(isStoryUnlocked(first, ['1-1', '1-2', '1-3', '1-4'])).toBe(false);
    expect(isStoryUnlocked(first, ['1-5'])).toBe(true);
    expect(isStoryUnlocked(last, ['1-5', '2-1', '2-2', '2-3', '2-4'])).toBe(false);
    expect(isStoryUnlocked(last, ['2-5'])).toBe(true);
    expect(unlockedStories({ clearedStages: [] }).map(story => story.id)).toEqual(['prologue']);
    expect(unlockedStories({ clearedStages: ['1-5'] }).map(story => story.id)).toEqual(['prologue', 'chapter-1']);
    expect(unlockedStories({ clearedStages: STAGES.map(stage => stage.id) }).map(story => story.id)).toEqual(['prologue', 'chapter-1', 'chapter-2']);
  });
});

describe('optional v1 story history', () => {
  it('backfills only the missing optional history while preserving XP, skills, levels and formation', () => {
    const { seenStoryIds: _seen, storageMessage: _message, ...saved } = earnedProfile();
    const storage = memoryStorage(saved); const write = vi.spyOn(storage, 'setItem');
    const restored = new ProfileService(storage);
    expect(restored.snapshot()).toEqual({ ...saved, seenStoryIds: [], storageMessage: '' });
    expect(restored.snapshot().version).toBe(1);
    expect(write).not.toHaveBeenCalled();
  });
  it('normalizes malformed, unknown, duplicate and prematurely seen IDs without resetting earned progress', () => {
    const saved = earnedProfile();
    for (const history of [null, 'prologue', 3, { id: 'prologue' }, ['prologue', 'prologue', 'missing', 'chapter-1', 'chapter-2', 7]]) {
      const restored = new ProfileService(memoryStorage({ ...saved, seenStoryIds: history })).snapshot();
      const expected = Array.isArray(history) ? ['prologue', 'chapter-1'] : [];
      expect(restored).toEqual({ ...saved, seenStoryIds: expected, storageMessage: '' });
      expect(restored.xp).toBe(saved.xp); expect(restored.equippedSkills).toEqual(saved.equippedSkills);
      expect(restored.equippedAllies).toEqual(saved.equippedAllies);
    }
  });
  it('does not turn malformed or skipped campaign progress into a valid save through story history', () => {
    const saved = earnedProfile();
    const profile = new ProfileService(memoryStorage({ ...saved, clearedStages: ['1-1', '1-5'], seenStoryIds: ['chapter-1'] }));
    expect(profile.snapshot()).toMatchObject({ xp: 0, clearedStages: [], seenStoryIds: [] });
    expect(profile.snapshot().storageMessage).not.toBe('');
  });
  it('persists a first eligible read once, treats replay as idempotent, and leaves all earned fields and receipts unchanged', () => {
    const storage = memoryStorage(); const write = vi.spyOn(storage, 'setItem'); const profile = new ProfileService(storage);
    const initial = profile.snapshot();
    expect(profile.markStorySeen('prologue').accepted).toBe(true);
    expect(profile.snapshot()).toEqual({ ...initial, seenStoryIds: ['prologue'] });
    expect(write).toHaveBeenCalledTimes(1);
    expect(profile.markStorySeen('prologue').accepted).toBe(true); expect(write).toHaveBeenCalledTimes(1);
    const beforeLocked = profile.snapshot();
    for (const id of ['chapter-1', 'chapter-2', 'missing', 'toString'] as StoryId[]) expect(profile.markStorySeen(id).accepted).toBe(false);
    expect(profile.snapshot()).toEqual(beforeLocked); expect(write).toHaveBeenCalledTimes(1);
    for (const stage of STAGES.slice(0, 5)) profile.rewardWin(`clear-${stage.id}`, stage.id);
    const earned = profile.snapshot(); write.mockClear();
    expect(profile.markStorySeen('chapter-1').accepted).toBe(true);
    expect(profile.snapshot()).toEqual({ ...earned, seenStoryIds: ['prologue', 'chapter-1'] });
    expect(write).toHaveBeenCalledTimes(1);
    expect(profile.rewardWin('clear-1-5', '1-5')).toBe(0);
    expect(profile.snapshot().xp).toBe(earned.xp);
    expect(new ProfileService(storage).snapshot()).toEqual(profile.snapshot());
    const beforeFinal = profile.snapshot(); expect(profile.markStorySeen('chapter-2').accepted).toBe(false); expect(profile.snapshot()).toEqual(beforeFinal);
    for (const stage of STAGES.slice(5)) profile.rewardWin(`clear-${stage.id}`, stage.id);
    expect(profile.markStorySeen('chapter-2').accepted).toBe(true);
    expect(profile.snapshot().seenStoryIds).toEqual(['prologue', 'chapter-1', 'chapter-2']);
  });
  it('returns frozen detached history and preserves read state in memory when storage is blocked', () => {
    const profile = new ProfileService({ getItem: () => null, setItem: () => { throw Error('blocked'); } });
    const previous = profile.snapshot(); const listener = vi.fn(); const off = profile.subscribe(listener);
    expect(profile.markStorySeen('prologue').accepted).toBe(true);
    expect(profile.snapshot().seenStoryIds).toEqual(['prologue']); expect(previous.seenStoryIds).toEqual([]);
    expect(Object.isFrozen(profile.snapshot().seenStoryIds)).toBe(true); expect(profile.snapshot().storageMessage).not.toBe('');
    expect(listener).toHaveBeenCalledTimes(2);
    profile.markStorySeen('prologue'); expect(listener).toHaveBeenCalledTimes(2);
    off(); profile.dispose();
  });
});
