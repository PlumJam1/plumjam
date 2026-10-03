# UI 화면 참고와 구현 대응

2026-10-03 UI 개선. [PONOS 공식 가이드](https://ponosgames.com/information/appli/battlecats/help/index.html)의 타이틀·준비실·지도·편성·육성·전투 화면을 직접 관찰하여 아래 배치와 색감을 재구성했다. 결과 화면은 공식 가이드와 별도로 공개 플레이 캡처를 관찰했다. 게임 규칙은 기존 인간 대 AI 프로토타입을 따른다.

| 화면 | 공식 참고 | 관찰한 배치·색감 | 구현 대응 |
| --- | --- | --- | --- |
| 타이틀 | [help12.png](https://ponosgames.com/information/appli/battlecats/help/img/help12.png) | 주황/노랑 배경·큰 게임 이름·중앙 시작 버튼·하단 캐릭터 | 자체 CSS 방사형 배경·인간의 마지막 출근 표제·게임 시작·기존 도트 등장인물 |
| 준비실 | [pict_030.png](https://ponosgames.com/information/appli/battlecats/help/img/pict_030.png) | 초록 소용돌이·갈색 상하 프레임·왼쪽 금색 버튼 3개·오른쪽 캐릭터와 말풍선·파란 XP | 전투 개시·파워 업·출전 편성, 오른쪽 개발자, 상점 등은 하단 빠른 메뉴 |
| 지도 | [pict_050.png](https://ponosgames.com/information/appli/battlecats/help/img/pict_050.png) | 옅은 종이지도·빨간 경로점과 흰 점선·가로 스테이지 카드·오른쪽 아래 출진 | 1-1~1-5 선택·클리어/잠김 표시·기존 보상/편성 안내·출진 |
| 편성 | [pict_027.png](https://ponosgames.com/information/appli/battlecats/help/img/pict_027.png) | 금색 5칸 줄·빈 칸 검은 바탕·중앙 캐릭터와 좌우 이웃 카드 | 기존 5칸 저장 편성·동료 살펴보기·선택 칸 장착·같은 동료 자리 교환 |
| 육성 | [pict_005.png](https://ponosgames.com/information/appli/battlecats/help/img/pict_005.png) | 중앙 성장 카드·노랑/분홍 강화 버튼·갈색 설명판 | 한 캐릭터의 현재/다음 수치·강화 비용·Lv.5 외형, 좌우 순환 선택 |
| 전투 | [help01.png](https://ponosgames.com/information/appli/battlecats/help/img/help01.png) | 왼쪽 위 정지·오른쪽 위 큰 노란 자금·왼쪽 아래 원형 경제·가운데 검은 테두리 소환 카드·오른쪽 원형 발사 | 왼쪽 투자 U·5병력/5스킬 2행·오른쪽 Hello World J, 비용/실패 사유/준비 막대·마우스/Tab 미리보기 |
| 결과 | [공개 플레이 캡처](https://appdata.hungryapp.co.kr/data_file/data_img_m/202010/M160285562339992130.jpg) · [게시글](https://m.hungryapp.co.kr/bbs/bbs_view.php?bcode=nyangko&pid=1015751) | 검은 굵은 테두리의 흰 승리 표제·반투명 검정/보라 경험치 띠와 노란 숫자·하단 드롭 보상 상자 | 큰 승리!!/패배 표제·검은 경험치 보상 띠·신규 동료 해금 알림·금색 주 행동·준비실 이동 |

## 표현 및 동작

- 크림 `#fff1c0`, 금색 `#ffc529`, 갈색 `#9f5734`, 초록 배경, 검은 두꺼운 테두리, 파란 XP/준비 막대, 분홍 선택·키보드 포커스를 사용한다. 사용 불가 버튼은 회색이며 이유를 남긴다.
- 소용돌이·얼룩 프레임·종이지도는 `public/assets/ui/`의 독립 작성 SVG이고, 버튼·경로점·점선은 CSS다. 공식 참고 화면 PNG를 게임 자산으로 포함하지 않는다. 기존 도트 캐릭터·배경·기지·효과음은 유지한다.
- Phaser 전장은 640:280 비율을 유지한다. 화면 크기에 따라 PC 게임 프레임을 확장하고 장식 요소는 클릭을 가로막지 않는다.
- 편성과 육성의 좌우 선택은 ViewModel의 씬 수명을 따른다. 선택만으로 XP·편성·레벨을 변경하지 않으며 장착·강화 버튼이 기존 모델 동작을 실행한다.
- 전투의 원형 Hello World 버튼과 중앙 J 카드는 같은 `useSkill('hello-world')`를 호출한다. 별도 스킬·쿨타임·비용을 만들지 않는다. 범위와 실제 대상·피해/회복 수치·버프 잔여 시간·피드백·키보드 조작을 유지한다.
- 일시정지와 결과 덮개는 전장과 하단 버튼 위에 놓인다. 저장 진행·해금·보상·게임 밸런스·씬 정리 규칙은 변경하지 않는다.
