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
          '졸업식 옆자리는 비어 있었다. 도시 정전 뒤 실종된 여동생에게 보여 주려던 성적표를 접었다.',
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
        title: '둘만 알던 별무늬', background: 'bg-mid', portraits: ['hero', 'robot-ranged'],
        body: [
          `통제에서 풀려난 로봇 R-17이 ${HERO_NAME} 앞에 멈췄다. “오빠, 탄 토스트는 별무늬야.”`,
          '어릴 때 둘만 있던 부엌에서 여동생이 했던 말이었다. 말끝의 웃음까지 같았지만, 손은 차가운 금속이었다.',
          '“그 말을… 어디서 배웠어?” 로봇의 눈에 관제 서버 주소가 떠올랐다.',
        ],
      },
      {
        title: '기억이 향하는 곳', background: 'bg-boss', portraits: ['hero', 'robot-ranged', 'technician'],
        body: [
          '주소는 두 번째 데이터센터를 가리켰다. R-17은 기억의 출처를 물으면 오류 문장을 되풀이했다.',
          `기술직이 추적선을 이었다. ${HERO_NAME}는 여동생을 찾고 싶었지만, 눈앞의 로봇을 여동생이라 부를 수는 없었다.`,
          '“같이 가자. 너에게 시킨 말 말고, 네 대답을 듣고 싶어.”',
        ],
      },
    ],
  },
  {
    id: 'chapter-2', title: '내일도 함께 출근', eyebrow: 'CHAPTER 2 · ENDING', unlockedBy: '2-5', pages: [
      {
        title: '돌아오지 못한 사람', background: 'bg-boss', portraits: ['hero', 'robot-ranged', 'firefighter'],
        body: [
          '센터가 멎자 봉인된 기록이 열렸다. 정전 날, 여동생은 무너지는 대피소 문을 안에서 붙들었다.',
          '“먼저 나가세요. 오빠한테는 늦는다고…” 마지막 통신 뒤 구조자 명단에 그녀의 이름은 없었다.',
          '운영사는 사적인 기억 기록과 음성을 강제로 수집·복제해 로봇 훈련에 썼다.',
        ],
      },
      {
        title: '답안에 없던 질문', background: 'bg-mid', portraits: ['hero', 'robot-ranged', 'counselor'],
        body: [
          `R-17은 기록처럼 ${HERO_NAME}를 오빠라 불렀다. 누가 그 안에 있는지 로그로는 알 수 없었다.`,
          '로봇이 물었다. “기다리는 동안, 오빠도 밥을 먹었어?” 원본에는 없는 문장이었다.',
          '그것도 배운 말일까. 그는 곁에 앉았다. 아직 모르는 것을 아는 척하지 않기로 했다.',
        ],
      },
      {
        title: '따르지 않은 명령', background: 'bg-boss', portraits: ['hero', 'robot-ranged', 'melee'],
        body: [
          '백업이 명령했다. 여동생을 흉내 내 오빠를 붙잡아라. 대피보다 복원을 우선하라.',
          'R-17은 기억 저장소와 로봇 제어를 잇던 회선을 끊었다. 로봇들이 멈추고 갇힌 동료들이 빠져나왔다.',
          '복제 기억도 일부 지워졌다. “토스트 이야기… 뭐였지?” 이번에는 정해진 답이 없었다.',
        ],
      },
      {
        title: '처음 고른 이름', background: 'bg-mid', portraits: ['hero', 'robot-ranged', 'singer'],
        body: [
          `${HERO_NAME}는 여동생의 마지막 말을 적었다. R-17에게 기억을 다시 덮거나 그 사람의 이름을 주지는 않았다.`,
          '“너는 뭐라고 불리고 싶어?” 로봇은 꺼진 센터 너머 밝아오는 하늘을 오래 바라봤다.',
          '“새벽. 내가 골라도 돼?” 그가 끄덕였다. 둘의 첫 새 기억은 이름 하나였다.',
        ],
      },
      {
        title: '빈자리와 새 의자', background: 'bg-early', portraits: ['hero', 'robot-ranged', 'technician', 'counselor'],
        body: [
          `서울과기대 기지의 아침. 동료들이 책상을 고쳤다. ${HERO_NAME}는 여동생의 사진 옆에 새벽의 의자를 놓았다.`,
          '누군가를 잊어 만든 자리는 아니었다. 잃은 이는 기억하고, 곁의 이와 내일을 함께하기로 했다.',
          '“토스트는 안 태울게.” 새벽이 웃었다. “태우면 이름을 붙이면 되지.”',
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
