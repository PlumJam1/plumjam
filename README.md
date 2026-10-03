# 플럼잼 — 인간의 마지막 출근

갓 컴공을 졸업한 개발자와 회사원들이 AI 침공에 맞서는 PC용 2D 웹게임 프로토타입. 냥코대전쟁의 병력·경제 운영과 팔라독의 주인공 조작을 참고한 하루 게임잼 프로젝트다.

## 실행

Node.js 22.x(22.12 이상), 24.x 또는 26 이상에서 실행한다. 전체 검증은 Node.js 26.4.0에서 통과했다.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

개발 서버는 http://127.0.0.1:5173, 정적 빌드 미리보기는 Vite가 터미널에 표시한 주소에서 열린다. 생성물은 `dist/`이며, 하위 경로 배포 시 `npm run build -- --base=/plumjam/`처럼 Vite base를 지정한다. 서버·계정 없이 로컬 브라우저에서 육성을 저장한다.

## 플레이

- `A/D` 또는 좌우 방향키: 주인공 이동. 병력 앞에 나가면 가장 가까운 공격 대상이 된다.
- `1/2/3`: 근접 회사원 / 원거리 회사원 / 서비스직 소환.
- `J`: Hello World 발사. `K`: 방사형 `sleep()` 이동 슬로우. `L`: 주인공을 포함한 주변 아군 힐.
- `U`: 수입과 자금 상한 강화. 소환·스킬·투자는 같은 자금을 쓴다.
- `Esc`: 일시정지. 브라우저 포커스가 사라져도 자동 일시정지한다.

적 기지를 부수면 승리한다. 주인공 또는 아군 기지가 파괴되면 패배하며, 동시 파괴는 패배를 우선한다. 버튼 클릭으로도 소환·스킬·투자를 사용할 수 있다. 기본 공격은 없다.

## 프로토타입 범위

`1-1`~`1-5`, 근접·원거리 로봇, 마지막 GPT-4o 보스가 구현되어 있다. 클리어 XP를 원하는 캐릭터에 분배하고, 이미 깬 맵을 반복해서 XP를 얻는다. 최대 레벨은 10, 레벨 5부터 외형이 바뀐다. 서비스직은 5초마다 힐·공격/방어·속도 지원 중 하나를 같은 확률로 선택한다. 같은 버프는 중첩 대신 시간을 갱신한다.

Vue MVVM UI와 순수 TypeScript 전투 모델을 분리했다. `SceneLifetimeManager`가 씬 실행의 이벤트·ViewModel·오디오·표시 객체를 정리하고, 공용 텍스처와 저장 서비스는 앱 수명을 따른다. 짧은 원본 WebAudio 효과음은 첫 키보드/클릭 입력으로 활성화된다. 음소거는 준비실·전투 화면에서 조절하며 저장된다. 배경 음악은 이번 범위에 포함하지 않았다.

타이틀의 중앙 시작 버튼, 준비실 메뉴, 스테이지 경로와 승리 보상 띠는 [냥코대전쟁 공식 안내](https://ponosgames.com/information/appli/battlecats/help/index.html)의 화면 흐름을 참고했다. 원작 UI·캐릭터·소리 파일을 사용하지 않는다.

## 에셋·출처

- 배경 3종과 캐릭터 11종은 ImageGen으로 생성했으며 원본 PNG를 수정 없이 사용한다. [생성 프롬프트와 목록](public/assets/generated/ASSET_PROMPTS.md), [원본 메타데이터](public/assets/generated/ASSET_METADATA.json).
- 서울과기대 심볼은 사용자가 지정한 필수 원본이다. [공식 심볼 안내](https://www.seoultech.ac.kr/intro/symbol/logo/symbol)에서 확보했고 파일은 `public/assets/bases/seoultech-symbol.gif`다. 외부 사용 사전 문의·상업적 사용 금지 조건을 SPEC에 기록했다.
- 효과음은 코드로 합성한 짧은 triangle 톤이다. 외부 오디오 샘플을 포함하지 않는다.
- 한국어 글꼴은 Google Fonts의 Noto Sans KR을 사용하며, 네트워크 없이도 시스템 sans-serif로 플레이할 수 있다.

[게임 명세](SPEC.md)와 [승인된 구현 계획](IMPLEMENTATION_PLAN.md)은 기획 기준이다. 초기 밸런스는 실제 플레이로 계속 다듬을 수 있다.
