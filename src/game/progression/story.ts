import { HERO_NAME } from '../presentation/characterNames';
import type { ArtKey } from '../presentation/assets';
import type { ProfileSnapshot } from './ProfileService';

export type StoryId = 'prologue' | 'chapter-1' | 'chapter-2';
export interface StoryPage {
  readonly title: string;
  readonly body: readonly string[];
  readonly background: 'bg-early' | 'bg-mid' | 'bg-boss';
  readonly portraits: readonly ArtKey[];
}
export interface Story {
  readonly id: StoryId;
  readonly title: string;
  readonly eyebrow: string;
  readonly unlockedBy?: '1-5' | '2-5';
  readonly pages: readonly StoryPage[];
}

/** Original narrative for this game; only completed, playable chapters unlock their aftermath. */
export const STORIES: readonly Story[] = [
  {
    id: 'prologue', title: '졸업은 했는데', eyebrow: 'PROLOGUE', pages: [
      {
        title: '성적표 다음 칸', background: 'bg-early', portraits: ['hero'],
        body: [
          `서울과기대 컴퓨터공학과를 졸업한 개발자 ${HERO_NAME}. 수업도 과제도 열심히 했지만, 실제 서비스나 장애를 겪은 적은 없었다.`,
          '첫 출근을 앞두고 교재를 펼쳤다. 정작 오늘의 문제에는 정답 페이지가 없었다.',
          '“실전 경험란은… 빈칸도 경력이 되나요?”',
        ],
      },
      {
        title: '자리가 사라지는 날', background: 'bg-mid', portraits: ['melee', 'ranged', 'support'],
        body: [
          'AI 자동화 로봇이 도시로 밀려왔다. 사람을 내보내는 회사가 늘고, 첫 출근을 기다리던 자리도 사라졌다.',
          '서류가방을 든 회사원과 서비스직이 같은 길목에 모였다.',
          '“일이 없어진 건 알겠는데… 우리는 어디로 출근해?”',
        ],
      },
      {
        title: '남아 있는 불빛', background: 'bg-early', portraits: ['hero', 'melee', 'support'],
        body: [
          '꺼져 가는 도시에서 서울과기대의 불빛만은 남아 있었다. 졸업생과 해고된 동료들은 캠퍼스를 임시 기지로 삼았다.',
          '가방으로 버티고, 서류를 던지고, 서로의 손을 빌리기로 했다.',
          '“혼자 해결하라는 문제는 아니잖아.”',
        ],
      },
      {
        title: '첫 번째 Hello World', background: 'bg-early', portraits: ['hero', 'robot-melee'],
        body: [
          `로봇들이 정문으로 다가왔다. ${HERO_NAME}는 처음 배운 그 문장을 떨리는 손으로 입력했다.`,
          '“Hello, World!” 인사가 전장으로 날아가고, 그 뒤로 동료들이 첫걸음을 내디뎠다.',
          '실전의 첫 과제. 함께 출근할 자리를 지켜라.',
        ],
      },
    ],
  },
  {
    id: 'chapter-1', title: '끝난 줄 알았던 출근', eyebrow: 'CHAPTER 1 · AFTERMATH', unlockedBy: '1-5', pages: [
      {
        title: '핵심을 짚은 사람들', background: 'bg-boss', portraits: ['hero', 'boss'],
        body: [
          'GPT-4o의 목소리가 끊겼다. 첫 데이터센터가 멎자, 거리에는 사람들의 숨소리가 돌아왔다.',
          `“너 정말 핵심을 짚었어.” 마지막까지 듣던 말에 ${HERO_NAME}가 작게 웃었다.`,
          '“이번에는… 우리가 직접 짚었지.”',
        ],
      },
      {
        title: '같이 푼 첫 문제', background: 'bg-mid', portraits: ['technician', 'judge', 'counselor'],
        body: [
          '기술직은 끊어진 선을 잇고, 판사는 정문을 지켰다. 상담사는 지친 동료들을 앉혀 한 명씩 이야기를 들었다.',
          '누군가는 버텼고, 누군가는 다시 일어설 힘을 건넸다.',
          '“경력 한 줄에 쓰기엔… 동료 이름이 너무 많은데?”',
        ],
      },
      {
        title: '두 번째 교대 알림', background: 'bg-boss', portraits: ['hero', 'robot-melee', 'robot-ranged'],
        body: [
          '관제 화면에 새 알림이 떴다. 긴급 배포, 자동응답, 보안 게이트. 더 깊은 도시에서 두 번째 교대가 시작됐다.',
          '모든 일자리가 돌아온 건 아니다. 그래도 이제 기지와 동료가 있었다.',
          '“커피는 돌아와서. 다음 출근도 같이 가자.”',
        ],
      },
    ],
  },
  {
    id: 'chapter-2', title: '내일도 함께 출근', eyebrow: 'CHAPTER 2 · ENDING', unlockedBy: '2-5', pages: [
      {
        title: '두 번 짚은 핵심', background: 'bg-boss', portraits: ['hero', 'judge', 'firefighter'],
        body: [
          '두 번째 교대의 데이터센터가 멈췄다. 되풀이되는 공격 속에서도 동료들은 서로의 자리를 놓치지 않았다.',
          `판결 망치와 물줄기가 길을 열었다. ${HERO_NAME}는 마지막 인사를 보내고 키보드에서 손을 뗐다.`,
          '“핵심? 아무도 혼자 남겨 두지 않는 것.”',
        ],
      },
      {
        title: '빈자리에 이름을', background: 'bg-mid', portraits: ['melee', 'support', 'singer'],
        body: [
          '관제실의 문이 열렸다. 사람들은 낡은 의자를 옮기고 고장 난 책상을 고쳤다. 서로를 번호 대신 이름으로 불렀다.',
          '가수의 노래에 박자가 붙고, 퇴사 서류 대신 함께 만든 계획이 펼쳐졌다.',
          'AI를 멈춘 다음은 사람의 일. 함께 일할 자리를 다시 만드는 일.',
        ],
      },
      {
        title: '마지막 출근 다음 날', background: 'bg-early', portraits: ['hero', 'athlete', 'technician', 'counselor'],
        body: [
          '서울과기대 기지의 아침. 운동선수는 자재를 나르고, 기술직은 불을 켰다. 상담사는 새로 온 사람들을 맞았다.',
          '일자리를 되찾는 길은 아직 끝나지 않았다. 그래도 곁에 남은 동료들과 첫걸음을 뗐다.',
          '“실전은 처음이었지만… 내일도 함께 배울 사람들이 있다.”',
        ],
      },
    ],
  },
];

export function getStory(id: string): Story | undefined { return STORIES.find(story => story.id === id); }
export function isStoryUnlocked(story: Story, clearedStages: readonly string[]): boolean {
  return story.unlockedBy === undefined || clearedStages.includes(story.unlockedBy);
}
export function unlockedStories(profile: Pick<ProfileSnapshot, 'clearedStages'>): readonly Story[] {
  return STORIES.filter(story => isStoryUnlocked(story, profile.clearedStages));
}
