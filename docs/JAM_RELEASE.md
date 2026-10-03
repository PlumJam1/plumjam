# 게임잼 웹 제출 준비

2026-10-04 기준: 웹 링크 중심으로 준비한다. **현재 GitHub Pages 게시·설정 변경·워크플로 실행은 하지 않았다.** 버전은 `0.1.0`이다.

## 나중에 GitHub Pages 게시하기

저장소는 `PlumJam1/plumjam`, 기본 브랜치는 `dev`다(읽기 조회 확인). `.github/workflows/pages.yml`은 **Run workflow로 수동 실행할 때만** 동작하며 push로 자동 게시하지 않는다. 이 파일이 기본 브랜치에 있어야 수동 실행이 표시된다. [GitHub workflow_dispatch 안내](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

나중에 게시할 때 저장소 관리자가 Settings → Pages의 Source를 **GitHub Actions**로 확인하고, Actions의 `Publish game to GitHub Pages (manual)`을 원하는 `dev` 커밋에서 실행한다. 테스트와 타입 검사·상대 경로 빌드를 통과한 결과만 공식 Pages artifact/deploy action으로 게시한다. GitHub Pages 환경에 별도 승인 규칙이 있으면 그 규칙을 따른다. [GitHub 공식 Pages 워크플로 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

예상 주소는 `https://plumjam1.github.io/plumjam/`다. **게시 성공이나 실제 접속을 확인한 주소가 아니다.** 배포 후 Actions의 실제 `page_url`을 제출 링크로 사용한다.

워크플로는 Node 24 LTS와 공식 [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact), [deploy-pages](https://github.com/actions/deploy-pages)를 사용한다. 빌드에는 `contents: read`, 배포에는 `pages: write`·`id-token: write`만 부여한다. 버전은 각 공식 저장소의 현재 메이저 태그를 확인했다. [Node LTS 목록](https://nodejs.org/en/about/previous-releases).

## 로컬 확인과 ZIP 백업

Node 24와 Python 3가 있는 환경에서:

```sh
npm ci
npm test
npm run package:jam
python3 -m http.server 4174 --bind 127.0.0.1 --directory artifacts/gamejam
```

브라우저에서 `http://127.0.0.1:4174/web/`를 연다. 이 하위 경로 실행은 Pages의 `/plumjam/`처럼 상대 경로가 필요한 배포를 확인하는 데 쓴다. 서버 종료는 Ctrl+C다. 기본 개발 빌드 `dist/`와 기존 preview는 별도로 유지된다.

- 웹 폴더: `artifacts/gamejam/web/`
- 백업 ZIP: `artifacts/gamejam/plumjam-web-0.1.0.zip`
- ZIP 루트에 `index.html`, `assets/`, 실행 안내·크레딧·MIT 고지가 바로 있다. 상위 `dist/` 폴더를 포함하지 않는다.
- `BUILD_MANIFEST.json`: 입력 소스 SHA-256·커밋·개별 파일 해시. 미커밋 변경까지 입력 해시로 기록하므로 커밋 번호만으로 내용이 같다고 단정하지 않는다.

ZIP을 풀고 해당 폴더에서 `python3 -m http.server 4174 --bind 127.0.0.1`로 실행하면 `http://127.0.0.1:4174/`에서 플레이할 수 있다. ES module 게임이므로 `file://`로 직접 열지 않는다. 브라우저 저장은 사이트 origin(프로토콜·호스트·포트)별로 유지되며, 같은 origin의 `/web/`와 `/`는 저장을 공유한다. 로컬 플레이 저장이 Pages로 이동하지 않는다. 온라인 글꼴 연결이 없으면 시스템 글꼴을 사용한다.

패키지 명령은 상대 base `./`로 별도 빌드하고 ZIP 항목·해시·빌드 중 소스 변경·기존 `dist/` 보존을 검사한다. 앞서 이 명령으로 만든 결과와 소유 기록이 그대로인 경우만 덮어쓴다. 산출물을 직접 수정했거나 소유 기록이 없으면 중단하므로 해당 폴더를 보관용 위치로 옮긴 뒤 다시 실행한다. 산출물은 git에서 제외한다.

## 확인 범위

로컬 `package:jam` 타입 검사·빌드·ZIP 루트/파일 해시·기존 `dist/` 보존 검사를 통과했다. `/web/`에서 웹 파일 59개 전부 HTTP 200 및 해시 일치, HTML 3개·CSS 7개 상대 참조를 확인했다. 수정된 산출물이 있으면 덮어쓰기를 거절하고 그대로 보존하는 경계도 확인했다. 수동 워크플로 YAML 구문·trigger·job 권한은 로컬 파서로 검사했으며 실제 Actions 실행은 하지 않았다.

Guide·튜토리얼·해금 동료 편성 경로 관련 17개 테스트를 통과했다. 준비된 산출물의 실제 화면·첫 클리어 검사는 별도로 수행한다. 모델의 10단계 캠페인 검증과 실제 브라우저 플레이를 구분하며, 모든 브라우저·전체 캠페인을 직접 플레이했다고 주장하지 않는다.

게임 내 크레딧과 동봉 `CREDITS.md`, `assets/music/CREDITS.md`, `THIRD_PARTY_LICENSES.txt`에 실제 출처·고지를 기록했다. 원본 음악·그림·서울과기대 심볼을 수정하지 않았으며, 출처 표시는 모든 권리의 별도 허가를 보증하지 않는다.

### 실제 웹 산출물 확인

동일한 패키지 소스 SHA의 `/web/`를 새 origin에서 확인했다. 최초 0 XP·클리어 0에서 프롤로그가 자동으로 열렸고, 실제 버튼 조작으로 1-1을 클리어했다(근접 2회·원거리 2회 소환, 투자 Lv.2, Hello World 1회, 마지막 3배속). 결과는 게임 시간 1:03, 코딩 조 HP 320·아군 기지 HP 900, +120 XP·기술직 해금이었다.

결과의 신규 동료 카드는 빈 4번 칸과 기술직 미리보기로 연결됐으며 자동 편성하지 않았다. 4번 칸 편성을 직접 확정하고 코딩 조를 Lv.1→2로 강화한 뒤 다시 불러와, 60 XP·1-1 CLEAR·1-2 해금·기술직 4번 칸·Hello World 장착 1개가 유지되는 것을 확인했다. 준비실의 기술직 미리보기 증거는 `gamejam-new-ally-oct04.png`로 기록했다.

일시정지에서 플레이 방법을 열었다가 Esc로 닫아도 전투는 정지 상태를 유지했다. 타이틀의 크레딧은 800×600에서 키보드로 하단 링크까지 이동할 때 자동 스크롤과 포커스 표시가 유지됐고, 모달은 하나만 활성화됐다. 검사 중 콘솔 경고·오류는 0이었다. 기존 4173 origin의 저장(0 XP·Hello World와 sleep() 장착)은 변경하지 않았다.

이는 실제 브라우저 **첫 스테이지** 확인이다. 전체 10단계와 보스를 직접 플레이한 증거로 사용하지 않으며 캠페인 모델 검증과 구분한다. GitHub Pages는 계속 수동 배포 준비 상태이고 아직 게시하지 않았다. 이 기록 추가는 문서만 변경하며 제품 소스와 ZIP은 검사 당시 그대로다.
