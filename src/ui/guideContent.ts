export interface GuideSection { readonly title: string; readonly lines: readonly string[] }
export interface CreditLink { readonly label: string; readonly href: string }
export interface CreditSection extends GuideSection { readonly links?: readonly CreditLink[] }

export const PLAY_GUIDE: readonly GuideSection[] = [
  { title: '첫 출근은 이렇게', lines: ['근접 회사원부터 소환하고, 뒤에 원거리 동료를 더해 전선을 만들자.', '소환·코딩 조의 스킬·경제 투자는 같은 전투 자금을 써. 자금은 시간이 지나면 차고, 투자하면 수입과 보유 상한이 늘어나.', '코딩 조는 병력 뒤에서 도와줘. 위험한 공격이 보이면 후퇴하자.'] },
  { title: '승리와 성장', lines: ['적 기지를 파괴하면 승리. 코딩 조 HP 또는 아군 기지 HP가 0이면 패배해.', '클리어 XP는 준비실에서 캐릭터 강화·스킬 구매에 사용해. 이미 깬 출근길도 다시 클리어해 XP를 모을 수 있어.', '새 동료가 해금돼도 자동 편성되지 않아. 출전 편성에서 칸과 동료를 골라 넣어줘.', '스킬은 구매한 뒤 별도로 장착해. 보유 스킬 중 최대 3개를 가져가며, 하단 큰 행동은 첫 장착 스킬이야.'] },
  { title: '병력과 스킬 조작', lines: ['A / D 또는 ← / →: 코딩 조 이동 · 1~5: 현재 병력 페이지 소환 · Q: 병력 페이지 전환.', '10칸 편성은 전투에서 5칸씩 두 페이지로 보여. 빈 칸은 소환되지 않아.', 'J Hello World · K sleep() · L 보너스 힐 · P git push · O overclock() · I foreach(). 장착한 스킬만 사용할 수 있어.', '버튼에 마우스를 올리거나 Tab으로 선택하면 범위·피해·비용·준비 상태를 확인할 수 있어. 살펴보기만으로 자금을 쓰지는 않아.'] },
  { title: '전장을 살펴보기', lines: ['U: 경제 투자 · R: 1/2/3배속 순환 · V: 근접/전체 시점 전환 · Esc: 일시정지와 복귀.', '보스 예고 자동감속은 새 전투에서 켜져 있어. 2/3배를 선택해도 보스 공격 예고 중에는 현재 진행만 1배가 돼.', '일시정지에서 자동감속을 켜거나 끌 수 있어. 예고가 모두 끝나면 최근 선택한 배속으로 돌아가.', '일시정지에서도 배속·시점·병력 페이지를 살펴볼 수 있어. 복귀 버튼을 누르기 전에는 전투가 진행되지 않아.'] },
  { title: '이야기와 소리', lines: ['처음 출근과 챕터를 마친 뒤 동료들의 이야기가 이어져. 이전/다음·방향키로 읽고 Esc로 마칠 수 있어.', '타이틀·준비실의 이야기 보관함에서 해금된 이야기를 다시 읽어봐.', '소리 ON/OFF는 준비실·일시정지·이야기·이 화면에서 바꿀 수 있어. 같은 음소거 설정을 공유해.'] },
];

export const GAME_CREDITS: readonly CreditSection[] = [
  { title: '인간의 마지막 출근', lines: ['기획·게임·UI·서사: PLUMJAM 팀', '인간과 AI의 전선을 지키는 PC 웹게임. 코딩 조와 동료들의 두 챕터를 함께해줘.'] },
  { title: '음악', lines: ['Quirky — leberch · 준비실과 지도', 'Tower Defense | 8-Bit Chiptune Game Music — NickPanek · 일반 전투', 'Chiptune Boss Fight Music — NickPanek · GPT-4o 전투', '제공된 음악의 출처와 라이선스는 아래에서 확인할 수 있어.'], links: [
    { label: 'Quirky 출처', href: 'https://pixabay.com/music/eccentric-quirky-quirky-501484/' },
    { label: 'Tower Defense 출처', href: 'https://pixabay.com/music/video-games-tower-defense-8-bit-chiptune-game-music-358521/' },
    { label: 'Boss Fight 출처', href: 'https://pixabay.com/music/video-games-chiptune-boss-fight-music-265080/' },
    { label: 'Pixabay 라이선스', href: 'https://pixabay.com/service/license-summary/' },
  ] },
  { title: '그림과 효과음', lines: ['배경 3개·캐릭터 이미지 23개: ImageGen 생성 원본.', '기지·투자/배속 이미지: 팀에서 제공한 원본. 종이 지도·무늬 프레임은 자체 SVG/CSS야.', '서울과학기술대학교 심볼: 사용자가 지정한 공식 원본.', '짧은 효과음은 게임에서 직접 만든 WebAudio 소리야.'], links: [{ label: '서울과기대 공식 심볼 안내', href: 'https://www.seoultech.ac.kr/intro/symbol/logo/symbol' }] },
  { title: '기술과 참고', lines: ['Phaser 4.2.1 · Vue 3.5.43 — MIT 라이선스.', '냥코대전쟁의 편성·경제·화면 흐름과 팔라독의 직접 조종 주인공을 참고했어. 참고 게임의 그림을 복사한 것은 아니야.'], links: [
    { label: 'Phaser', href: 'https://phaser.io/' }, { label: 'Vue', href: 'https://vuejs.org/' },
    { label: 'The Battle Cats 공식 안내', href: 'https://ponosgames.com/information/appli/battlecats/help/index.html' },
    { label: 'Paladog 제작자 게시 페이지', href: 'https://www.kongregate.com/en/games/fazecat/paladog' },
  ] },
];
