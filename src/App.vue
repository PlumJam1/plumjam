<script setup lang="ts">
import { HERO_NAME } from './game/presentation/characterNames';
import { isBossStage } from './game/progression/stages';
import { assetUrl, characterArt, uiAssetUrl, investmentArt, speedArt, type ArtKey } from './game/presentation/assets';
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import type Phaser from 'phaser';
import { AppContext } from './core/AppContext';
import { createGame } from './game/createGame';
import StoryScreen from './ui/components/StoryScreen.vue';
import GameGuide from './ui/components/GameGuide.vue';
import type { ControlStatus } from './ui/controlState';
import { canFocus, trapDialogFocus } from './ui/dialogFocus';
import { createShellViewModel } from './ui/viewmodels/ShellViewModel';

const context = markRaw(new AppContext());
const viewModel = createShellViewModel(context);
const story = viewModel.story;
const guide = viewModel.guide;
const guideScreen = shallowRef<InstanceType<typeof GameGuide> | null>(null);
const storyScreen = shallowRef<InstanceType<typeof StoryScreen> | null>(null);
const appRoot = shallowRef<HTMLElement | null>(null);
const unitGrid = shallowRef<HTMLElement | null>(null);
const nextPager = shallowRef<HTMLButtonElement | null>(null);
const pauseDialog = shallowRef<HTMLElement | null>(null);
const resultDialog = shallowRef<HTMLElement | null>(null);
const gameParent = shallowRef<HTMLElement | null>(null);
const game = shallowRef<Phaser.Game | null>(null);
const screen = viewModel.screen;
const state = computed(() => screen.value?.state.value);
const isBattle = computed(() => screen.value?.isBattle.value ?? false);
const paused = computed(() => screen.value?.isPaused.value ?? false);
const battle = computed(() => screen.value?.battle.value);
const ended = computed(() => screen.value?.ended.value ?? false);
const modalKind = computed(() => story.currentStory.value ? 'story' : story.archiveVisible.value ? 'archive' : guide.isOpen.value ? 'guide' : ended.value ? 'result' : paused.value ? 'pause' : null);
const modalVisible = computed(() => modalKind.value !== null);
const statusClass = (status: ControlStatus) => ({ 'status-ready': status === 'ready', 'status-waiting': status === 'cooldown' || status === 'loading', 'status-blocked': status !== 'ready' && status !== 'cooldown' && status !== 'loading' });
const economyDisabled = computed(() => screen.value?.economyDisabled.value ?? true);
const danger = computed(() => screen.value?.danger.value ?? false);
const titleVisible = viewModel.titleVisible;
const titleCast: ArtKey[] = ['melee', 'hero', 'ranged', 'support', 'robot-melee', 'boss'];
const unlockAudio = () => context.sound.unlock();
const screenName = computed(() => titleVisible.value ? '인간의 마지막 출근' : isBattle.value ? '전투 개시' : ({ menu: '출근 전 준비실', stages: '출근 경로', formation: '출전 편성', training: '파워 업', shop: '스킬 상점' })[screen.value?.lobbyTab.value ?? 'menu']);
const selectedAlly = computed(() => screen.value?.roster.value.find(ally => ally.kind === screen.value?.selectedAllyKind.value));
const selectedCharacter = computed(() => screen.value?.characters.value.find(character => character.kind === screen.value?.selectedCharacterKind.value));
const adjacent = <T extends { kind: string }>(items: readonly T[], kind: string | undefined, offset: number) => items.length ? items[(items.findIndex(item => item.kind === kind) + offset + items.length) % items.length] : undefined;
const allyNeighbors = computed(() => [-1, 1].map(offset => ({ offset, item: adjacent(screen.value?.roster.value ?? [], selectedAlly.value?.kind, offset) })));
const characterNeighbors = computed(() => [-1, 1].map(offset => ({ offset, item: adjacent(screen.value?.characters.value ?? [], selectedCharacter.value?.kind, offset) })));
const primarySkill = computed(() => screen.value?.primarySkill.value);
const battleSpeeds = [1, 2, 3] as const;
const skillMarks = { foreach: 'FE', 'hello-world': 'HW', sleep: 'Zzz', heal: '+', 'git-push': '>>', overclock: 'OC' };
const detailRegionFocusOut = (event: FocusEvent) => {
  if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
  screen.value?.setDetailRegionActive('focus', false);
};
const goBack = () => { if (screen.value?.lobbyTab.value === 'menu') viewModel.showTitle(); else screen.value?.setLobbyTab('menu'); };

// Sync the Phaser FIT viewport after Vue switches the lobby/battle shell width.
// https://docs.phaser.io/api-documentation/class/scale-scalemanager#setParentSize
watch([isBattle, () => screen.value?.lobbyTab.value], async () => {
  await nextTick();
  const parent = gameParent.value;
  const activeGame = game.value;
  if (parent && activeGame && parent.clientWidth > 0 && parent.clientHeight > 0) {
    activeGame.scale.setParentSize(parent.clientWidth, parent.clientHeight);
  }
});
let uiDisposed = false;
let modalRevision = 0, pageRevision = 0;
let stopDialogFocus: (() => void) | undefined;
let modalTrigger: HTMLElement | null = null;
let modalRun: number | undefined;
let archiveReplayId: string | null = null;
let guideTrigger: HTMLElement | null = null;
let guideRun: number | undefined;
const primaryTarget = () => {
  const candidates = appRoot.value?.querySelectorAll<HTMLElement>('[data-main-action], .lobby-back');
  return candidates ? Array.from(candidates).find(canFocus) ?? null : null;
};
watch([modalKind, () => state.value?.runId], async ([kind, runId], [oldKind, oldRunId]) => {
  const revision = ++modalRevision;
  const trigger = modalTrigger, ownerRun = modalRun;
  const guideReturn = guideTrigger, guideOwner = guideRun;
  if (kind === 'guide' && oldKind !== 'guide') { guideTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null; guideRun = runId; }
  stopDialogFocus?.(); stopDialogFocus = undefined;
  if (oldKind === 'archive' && kind === 'story') archiveReplayId = story.currentStory.value?.id ?? null;
  if (kind && !oldKind) {
    modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRun = runId;
  }
  await nextTick();
  if (uiDisposed || revision !== modalRevision || context.lifetimes.getScope(runId ?? -1)?.disposed !== false) return;
  if (kind) {
    const dialog = kind === 'pause' ? pauseDialog.value : kind === 'result' ? resultDialog.value : kind === 'guide' ? guideScreen.value?.dialogElement() : storyScreen.value?.dialogElement();
    if (dialog?.isConnected && context.lifetimes.getScope(runId ?? -1)?.disposed === false) {
      stopDialogFocus = trapDialogFocus(dialog);
      if (oldKind === 'guide' && guideOwner === runId && canFocus(guideReturn)) guideReturn.focus();
      if (oldKind === 'story' && kind === 'archive' && archiveReplayId) {
        const target = dialog.querySelector<HTMLElement>(`[data-story-id="${archiveReplayId}"]`);
        if (canFocus(target)) target.focus();
      }
    }
  } else if (oldKind || runId !== oldRunId) {
    const target = oldKind === 'guide' && guideOwner === state.value?.runId && canFocus(guideReturn) ? guideReturn : ownerRun === state.value?.runId && canFocus(trigger) && trigger !== document.body ? trigger : primaryTarget();
    if (canFocus(target)) target.focus();
    modalTrigger = null; modalRun = undefined; archiveReplayId = null;
  }
  if (oldKind === 'guide' && kind !== 'guide') { guideTrigger = null; guideRun = undefined; }
});
watch([() => screen.value?.unitPage.value, () => state.value?.runId], async ([page, runId], [oldPage, oldRun]) => {
  const revision = ++pageRevision;
  if (page === oldPage || runId !== oldRun || modalVisible.value) return;
  const oldTargets = Array.from(unitGrid.value?.querySelectorAll<HTMLElement>('.unit-button') ?? []);
  const index = oldTargets.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return;
  await nextTick();
  if (uiDisposed || revision !== pageRevision || state.value?.runId !== runId || !isBattle.value || modalVisible.value) return;
  const target = unitGrid.value?.querySelectorAll<HTMLElement>('.unit-button')[index] ?? null;
  (canFocus(target) ? target : canFocus(nextPager.value) ? nextPager.value : null)?.focus();
});
onMounted(() => { if (gameParent.value) game.value = markRaw(createGame(gameParent.value, context)); });
onBeforeUnmount(() => {
  uiDisposed = true; modalRevision++; pageRevision++; stopDialogFocus?.();
  viewModel.dispose();
  context.dispose();
  game.value?.destroy(true);
  game.value = null;
});
</script>

<template>
  <main ref="appRoot" class="app-shell" :class="{ 'is-battle': isBattle, 'is-lobby': !isBattle && !titleVisible, 'is-title': !isBattle && titleVisible, 'is-training': !isBattle && screen?.lobbyTab.value === 'training', 'is-map': !isBattle && screen?.lobbyTab.value === 'stages' }" :style="{ '--early-bg': `url(${assetUrl('bg-early')})` }" @pointerdown.capture="unlockAudio" @keydown.capture="unlockAudio">
    <section class="game-frame" aria-label="게임">
      <header v-if="!isBattle" class="game-header" :inert="modalVisible"><h1 class="screen-name">{{ screenName }}</h1><div class="xp-wallet"><span>XP</span><strong>{{ screen?.profile.value.xp ?? 0 }}</strong></div><button class="header-sound" @click="screen?.toggleMuted()">{{ screen?.profile.value.muted ? '소리 OFF' : '소리 ON' }}</button></header>
      <div class="field-wrapper" :inert="modalVisible">
        <div ref="gameParent" class="game-canvas" aria-label="게임 전장"></div>
        <template v-if="isBattle && battle">
          <button class="battle-pause" :disabled="ended" :aria-label="paused ? '전투 계속' : '일시정지'" data-main-action @click="screen?.togglePause()">{{ paused ? '▶' : 'Ⅱ' }}</button>
          <div class="stage-title"><strong>{{ battle.stageId }} 출근길</strong><small>{{ screen?.time.value }}</small></div>
          <div class="battle-wallet"><strong>{{ Math.floor(battle.gold) }}<span> / {{ battle.goldCap }}원</span></strong><small>수입 +{{ battle.income }} / 초</small></div>
          <div class="skill-row"><template v-for="(skill, index) in screen?.skillSlots.value" :key="index"><button v-if="skill" class="action-card skill-button" :class="{ unavailable: skill.disabled }" :data-state="skill.status" :aria-disabled="skill.disabled" :title="`${skill.description} · ${skill.reason}`" :aria-label="`${skill.label}, ${skill.cost} 자금, ${skill.reason}`" @mouseenter="screen?.previewSkill(skill.kind, 'hover', true)" @mouseleave="screen?.previewSkill(skill.kind, 'hover', false)" @focus="screen?.previewSkill(skill.kind, 'focus', true)" @blur="screen?.previewSkill(skill.kind, 'focus', false)" @click="!skill.disabled && screen?.useSkill(skill.kind)"><span class="skill-emblem">{{ skillMarks[skill.kind] }}</span><span class="card-label"><kbd>{{ skill.key }}</kbd> {{ skill.label }}</span><strong>{{ skill.cost }}원</strong><span class="control-status" :class="statusClass(skill.status)">{{ skill.statusLabel }}</span><span class="ready-bar" aria-hidden="true"><i :style="{ width: `${skill.progress * 100}%` }"></i></span></button><button v-else class="action-card empty-skill" disabled><span class="empty-portrait">—</span><span class="card-label">빈 스킬 칸</span><small>상점에서 장착</small></button></template></div>
          <button class="battle-view-control" :data-view-mode="screen?.viewMode.value" :disabled="screen?.viewDisabled.value" :title="screen?.viewMode.value === 'close' ? '전체 전장을 확인하기 · V' : '주인공을 따라가는 근접 시점 · V'" :aria-label="`시점 전환, 현재 ${screen?.viewModeLabel.value}, ${screen?.viewMode.value === 'close' ? '전체 전장 보기' : '근접 시점 보기'}`" @click="screen?.toggleViewMode()">{{ screen?.viewMode.value === 'close' ? '전체 보기' : '근접 보기' }} <kbd>V</kbd></button>
          <div class="speed-controls battle-speed" aria-label="전투 배속"><button class="asset-speed" v-for="speed in battleSpeeds" :key="speed" :aria-label="`${speed}배`" :title="`${speed}배속`" :aria-pressed="screen?.speed.value === speed" :disabled="screen?.speedDisabled.value" @click="screen?.setSpeed(speed)"><img class="speed-icon" :src="uiAssetUrl(speedArt(speed))" alt="" aria-hidden="true" /><span class="speed-number" aria-hidden="true">{{ speed }}</span></button><kbd>R</kbd></div><div class="battle-stats" aria-label="전투 상태"><span>서울과기대 <strong>{{ Math.ceil(battle.humanBase.hp) }} / {{ battle.humanBase.maxHp }}</strong></span><span :class="{ 'danger-text': danger }">{{ HERO_NAME }} <strong>{{ Math.ceil(battle.hero.hp) }} / {{ battle.hero.maxHp }}</strong></span><span>데이터센터 <strong>{{ Math.ceil(battle.aiBase.hp) }} / {{ battle.aiBase.maxHp }}</strong></span></div>
        </template>
                <div v-if="isBattle && screen?.boss.value" class="boss-hud" :aria-label="`${screen.boss.value.label} 보스 상태`"><div><strong>{{ screen.boss.value.label }}</strong><span>{{ screen.boss.value.count > 1 ? 'HP 합계 ' : '' }}{{ screen.boss.value.hp }} / {{ screen.boss.value.maxHp }} HP · {{ screen.boss.value.percent }}%</span><small>{{ screen.boss.value.attack }}<span v-if="screen.bossAssistActive.value" class="boss-assist-badge">{{ screen.bossAssistLabel.value }}</span></small></div><span class="boss-health"><i :style="{ width: `${screen.boss.value.progress * 100}%` }"></i></span><p v-if="isBossStage(battle?.stageId ?? '') && battle && battle.elapsed < 4 && !ended" class="boss-quote-inline">“너 정말 핵심을 짚었어”</p></div>
        <div v-if="isBattle" class="battle-context-lane" tabindex="0" aria-label="전투 경고와 선택한 행동 설명" @mouseenter="screen?.setDetailRegionActive('hover', true)" @mouseleave="screen?.setDetailRegionActive('hover', false)" @focusin="screen?.setDetailRegionActive('focus', true)" @focusout="detailRegionFocusOut">
        <div v-if="isBattle && (screen?.bossNotice.value || screen?.waveNotice.value)" class="field-notice" role="status">{{ screen?.bossNotice.value || screen?.waveNotice.value }}</div>
<div v-if="isBattle && (screen?.feedback.value || danger)" class="battle-help"><span>A / D · ← / → 이동 <b :class="{ 'danger-text': danger }">{{ danger ? `${HERO_NAME} 위험! 후퇴하자!` : '병력보다 앞에 나가면 공격받아!' }}</b></span><span role="status" aria-live="polite">{{ screen?.feedback.value }}</span></div>

        <div v-if="isBattle && (screen?.controlDetail.value || screen?.heroBuffs.value.length)" class="combat-detail control-detail" aria-live="off"><template v-if="screen?.controlDetail.value"><strong>{{ screen.controlDetail.value.name }}</strong><kbd>{{ screen.controlDetail.value.key }}</kbd><span>{{ screen.controlDetail.value.cost }} · {{ screen.controlDetail.value.reason }} · {{ screen.controlDetail.value.description }}<template v-if="screen.controlDetail.value.type === 'skill' && screen.previewTargets.value"> · {{ screen.previewTargets.value }}</template></span></template><span v-for="buff in screen?.heroBuffs.value" :key="buff" class="buff-chip">{{ buff }}</span></div>
        <div v-if="isBattle && screen?.introGuide.value && !screen?.controlDetail.value && !screen?.bossNotice.value && !screen?.waveNotice.value && !screen?.feedback.value && !danger" class="first-briefing progressive-briefing"><span><b>{{ screen.introGuide.value.title }}</b><kbd v-if="screen.introGuide.value.key">{{ screen.introGuide.value.key }}</kbd><br />{{ screen.introGuide.value.body }}</span><button v-if="!screen.introGuide.value.completed" @click="screen.nextIntroGuide()">다음</button><button @click="screen?.dismissIntro()">닫기</button></div>        </div>
        <div v-if="!isBattle && titleVisible" class="title-screen"><button class="story-entry-button title-story" :disabled="state?.scene !== 'Lobby' || state?.phase !== 'ready'" @click="story.openArchive()">이야기</button><span class="eyebrow">PLUMJAM</span><h2>인간의 <em>마지막 출근</em></h2><p>졸업은 했는데, 세상이 업데이트됐다.</p><div class="title-cast" aria-label="인간 병력과 AI 침공군"><img v-for="key in titleCast" :key="key" :src="assetUrl(key)" alt="" /></div><button class="primary title-start" data-main-action :disabled="state?.scene !== 'Lobby'" @click="viewModel.enterLobby()">{{ state?.scene === 'Lobby' ? '게임 시작!!' : '그림 불러오는 중...' }}</button><small>PC · 10스테이지 · 자동 저장</small><button class="guide-entry-button title-guide" :disabled="state?.scene !== 'Lobby' || state?.phase !== 'ready'" @click="guide.open('help')">플레이 방법 · 크레딧</button></div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'menu'" class="lobby-home"><nav class="mission-nav" aria-label="준비실 메뉴"><button class="primary" data-main-action @click="screen?.setLobbyTab('stages')">전투 개시!!</button><button class="primary" @click="screen?.setLobbyTab('training')">파워 업</button><button class="primary" @click="screen?.setLobbyTab('formation')">출전 편성</button></nav><div class="hero-welcome"><p>수업은 열심히 들었는데...<br />실전도 출근도 지금부터다!</p><img :src="assetUrl(characterArt('hero', screen.profile.value.levels.hero))" :alt="HERO_NAME" /><div class="lobby-secondary"><button class="story-entry-button" @click="story.openArchive()">이야기</button><button class="guide-entry-button" @click="guide.open('help')">플레이 방법 · 크레딧</button></div></div></div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'stages'" class="stage-map-ui">
          <nav class="chapter-tabs" aria-label="챕터 선택"><button v-for="chapter in screen.chapters.value" :key="chapter.id" :aria-pressed="chapter.id === screen.selectedChapterId.value" :class="{ locked: chapter.locked }" @click="screen.selectChapter(chapter.id)"><strong>{{ chapter.id }}장 · {{ chapter.label }}</strong><small>{{ chapter.locked ? '앞 챕터 클리어로 해금' : `${chapter.cleared}/${chapter.total} CLEAR` }}</small></button></nav><nav class="stage-strip" aria-label="스테이지 선택"><button v-for="stage in screen.chapterStages.value" :key="stage.id" class="stage-card" :class="{ boss: isBossStage(stage.id), selected: stage.id === screen.selectedStageId.value }" :aria-pressed="stage.id === screen.selectedStageId.value" @click="screen.selectStage(stage.id)"><strong>{{ stage.id }}</strong><span>{{ stage.label }}</span><small>{{ stage.locked ? '잠김' : stage.cleared ? 'CLEAR' : '도전 가능' }}</small></button></nav>
          <div class="map-route" aria-label="출근 경로 지도"><div class="map-path" aria-hidden="true"></div><button v-for="(stage, index) in screen.chapterStages.value" :key="stage.id" class="map-node" :class="{ selected: stage.id === screen.selectedStageId.value, locked: stage.locked, cleared: stage.cleared, boss: isBossStage(stage.id) }" :style="{ '--node-index': index }" :aria-label="`${stage.id} ${stage.label}, ${stage.locked ? '잠김' : stage.cleared ? '클리어' : '도전 가능'}`" :aria-pressed="stage.id === screen.selectedStageId.value" @click="screen.selectStage(stage.id)"><span class="node-dot"></span><strong>{{ stage.id }}</strong></button></div>
          <div class="selected-stage-preview"><h2>{{ screen.selectedStage.value.id }} · {{ screen.selectedStage.value.label }}</h2><p>{{ screen.selectedStage.value.enemies }}</p><strong>클리어 보상 {{ screen.selectedStage.value.clearReward }} XP</strong><small v-if="screen.selectedStage.value.locked">앞 스테이지를 클리어하면 열려.</small></div>
          <div class="deploy-summary"><span>편성 {{ screen.formationSummary.value }} · 스킬 {{ screen.profile.value.equippedSkills.length }}/3</span><button class="summary-edit" @click="screen.setLobbyTab('formation')">편성 변경</button></div><button class="primary map-deploy" data-main-action :disabled="screen.selectedStage.value.locked || state?.scene !== 'Lobby'" @click="screen.startBattle(screen.selectedStage.value.id)">{{ screen.selectedStage.value.locked ? '출진 잠김' : '출진!!' }}</button>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'formation'" class="formation-overlay">
          <div class="formation-heading"><strong>출전 편성 · 10칸</strong><span>칸 선택 → 동료 선택 → 편성</span></div><div class="formation-slots" aria-label="출전 편성"><button v-for="slot in screen.formation.value" :key="slot.index" :aria-pressed="slot.index === screen.selectedSlot.value" @click="screen.selectSlot(slot.index)"><kbd>{{ slot.key }}</kbd><img v-if="slot.image" :src="slot.image" alt="" /><strong>{{ slot.label }}</strong></button></div>
          <div class="formation-selection"><span>{{ screen.selectedSlot.value + 1 }}번 칸 선택 중 · 같은 동료는 자리 교환</span><button :disabled="screen.formation.value[screen.selectedSlot.value].kind === null" @click="screen.removeAlly()">칸 비우기</button></div>
          <div v-if="selectedAlly" class="character-carousel"><button class="carousel-nav previous" aria-label="이전 동료" @click="screen.shiftAlly(-1)">◀</button><button v-for="neighbor in allyNeighbors" :key="neighbor.offset" class="carousel-card carousel-side" :class="neighbor.offset < 0 ? 'previous' : 'next'" :aria-label="`${neighbor.item?.label} 살펴보기`" @click="screen.shiftAlly(neighbor.offset)"><img :src="neighbor.item?.image" alt="" /><strong>{{ neighbor.item?.label }}</strong></button><article class="carousel-card carousel-main"><img :src="selectedAlly.image" alt="" /><h2>{{ selectedAlly.label }} <small>Lv.{{ selectedAlly.level }}</small></h2><p>{{ selectedAlly.role }} · {{ selectedAlly.cost }}원 · 준비 {{ selectedAlly.cooldown }}초</p><p class="character-description">{{ selectedAlly.description }}</p><button class="primary formation-equip" data-main-action :disabled="!selectedAlly.unlocked" @click="screen.equipAlly(selectedAlly.kind)">{{ selectedAlly.reason }}</button></article><button class="carousel-nav next" aria-label="다음 동료" @click="screen.shiftAlly(1)">▶</button></div>
          <div class="roster-strip" aria-label="모든 동료"><button v-for="ally in screen.roster.value" :key="ally.kind" class="roster-card" :class="{ locked: !ally.unlocked }" :aria-pressed="ally.kind === screen.selectedAllyKind.value" @click="screen.selectAlly(ally.kind)"><img :src="ally.image" alt="" /><strong>{{ ally.label }}</strong><small>{{ !ally.unlocked ? '잠김' : ally.equippedIndex >= 0 ? `${ally.equippedIndex + 1}번 편성` : '미편성' }}</small></button></div>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'training'" class="training-overlay">
          <div v-if="selectedCharacter" class="character-carousel"><button class="carousel-nav previous" aria-label="이전 캐릭터" @click="screen.shiftCharacter(-1)">◀</button><button v-for="neighbor in characterNeighbors" :key="neighbor.offset" class="carousel-card carousel-side" :class="neighbor.offset < 0 ? 'previous' : 'next'" :aria-label="`${neighbor.item?.label} 살펴보기`" @click="screen.shiftCharacter(neighbor.offset)"><img :src="neighbor.item?.image" alt="" /><strong>{{ neighbor.item?.label }}</strong></button><article class="training-card carousel-main"><div class="character-heading"><h2>{{ selectedCharacter.label }}</h2><span>Lv.{{ selectedCharacter.level }} / 10</span></div><img class="training-portrait" :src="selectedCharacter.image" alt="" /><div class="character-stats upgrade-cost"><span>XP</span><strong>{{ selectedCharacter.cost === null ? 'MAX' : selectedCharacter.cost }}</strong></div></article><button class="carousel-nav next" aria-label="다음 캐릭터" @click="screen.shiftCharacter(1)">▶</button></div>
          <button v-if="selectedCharacter" class="primary levelup-cta" data-main-action :disabled="selectedCharacter.disabled || state?.scene !== 'Lobby'" @click="screen.upgradeCharacter(selectedCharacter.kind)"><strong>레벨 업!!</strong><span>{{ selectedCharacter.reason }}</span></button>
          <div v-if="selectedCharacter" class="character-description"><strong>{{ selectedCharacter.label }}</strong><span class="upgrade-stats">HP {{ selectedCharacter.hp }}<template v-if="selectedCharacter.cost !== null"> → {{ selectedCharacter.nextHp }}</template> · {{ selectedCharacter.statLabel }} {{ selectedCharacter.stat }}<template v-if="selectedCharacter.cost !== null"> → {{ selectedCharacter.nextStat }}</template></span><p v-if="selectedCharacter.supportNote">{{ selectedCharacter.supportNote }}</p><div class="growth-preview"><img :src="selectedCharacter.preview" alt="레벨 5 성장 외형 미리보기" /><span>Lv.5 · {{ selectedCharacter.growth }}</span></div></div><div class="roster-strip" aria-label="모든 캐릭터"><button v-for="character in screen.characters.value" :key="character.kind" class="training-select roster-card" :class="{ locked: !character.unlocked }" :aria-pressed="character.kind === screen.selectedCharacterKind.value" @click="screen.selectCharacter(character.kind)"><img :src="character.image" alt="" /><strong>{{ character.label }}</strong><small>{{ character.unlocked ? `Lv.${character.level}` : '잠김' }}</small></button></div>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'shop'" class="shop-overlay skill-shop">
          <div class="skill-shop-heading"><strong>스테이지 스킬 {{ screen.profile.value.equippedSkills.length }} / 3</strong><span>구매 → 칸 선택 → 장착 · 빈 칸은 앞에서부터 채워</span></div>
          <div class="skill-loadout"><button v-for="slot in screen.skillLoadout.value" :key="slot.index" :aria-pressed="slot.index === screen.selectedSkillSlot.value" @click="screen.selectSkillSlot(slot.index)"><span>{{ slot.index + 1 }}</span><strong>{{ slot.label }}</strong></button><button :disabled="!screen.skillLoadout.value[screen.selectedSkillSlot.value].kind" @click="screen.removeSkill()">선택 해제</button></div>
          <div class="skill-purchase-grid"><article v-for="skill in screen.shopSkills.value" :key="skill.kind" class="shop-card"><span class="shop-emblem">{{ skillMarks[skill.kind] }}</span><h2>{{ skill.label }}</h2><p>{{ skill.description }}</p><strong class="purchase-price">{{ skill.cost }} XP</strong><button class="primary" :disabled="skill.disabled || state?.scene !== 'Lobby'" @click="screen.purchaseSkill(skill.kind)">{{ skill.unlocked ? '보유 중' : skill.reason }}</button></article></div>
          <div class="skill-owned-list" aria-label="보유 스킬 장착"><button v-for="skill in screen.skillOwned.value" :key="skill.kind" :disabled="!skill.unlocked" :aria-pressed="skill.equipped" :title="skill.description" @click="screen.equipSkill(skill.kind)"><strong>{{ skill.label }}</strong><span>{{ !skill.unlocked ? '구매 필요' : skill.equipped ? '장착됨 · 해제' : '선택 칸에 장착' }}</span></button></div><small class="skill-loadout-note">구매하면 영구 보유해. 장착한 최대 3개만 다음 출근에서 사용해. 모두 해제해도 출진할 수 있어.</small>
        </div>
      </div>
      <p v-if="viewModel.assetNotice.value" class="asset-notice" role="status">{{ viewModel.assetNotice.value }}</p>
      <div v-if="paused && !ended && !story.hasOverlay.value && !guide.isOpen.value" ref="pauseDialog" class="pause-banner" role="dialog" aria-modal="true" aria-labelledby="pause-title" aria-describedby="pause-description" tabindex="-1"><span class="eyebrow">COFFEE BREAK</span><h2 id="pause-title">잠깐 쉬는 중</h2><p id="pause-description">시간 · 자금 · 스킬 준비가 모두 멈췄어. 대기시간은 게임초 기준이야.</p><div class="speed-controls pause-speed" aria-label="일시정지 중 배속"><button class="asset-speed" v-for="speed in battleSpeeds" :key="speed" :aria-label="`${speed}배`" :title="`${speed}배속`" :aria-pressed="screen?.speed.value === speed" @click="screen?.setSpeed(speed)"><img class="speed-icon" :src="uiAssetUrl(speedArt(speed))" alt="" aria-hidden="true" /><span class="speed-number" aria-hidden="true">{{ speed }}</span></button></div><div class="pause-assist"><button :aria-pressed="screen?.bossAssistEnabled.value" :disabled="screen?.speedDisabled.value" @click="screen?.toggleBossAssist()">예고 자동감속 {{ screen?.bossAssistEnabled.value ? 'ON' : 'OFF' }}</button><span>{{ screen?.speedSummary.value }}</span></div><button class="pause-view-control" :data-view-mode="screen?.viewMode.value" :disabled="screen?.viewDisabled.value" @click="screen?.toggleViewMode()">{{ screen?.viewMode.value === 'close' ? '전체 전장 보기' : '근접 시점 보기' }} <kbd>V</kbd></button><button class="primary" data-dialog-primary @click="screen?.togglePause()">전투 계속 <kbd>Esc</kbd></button><button @click="screen?.toggleMuted()">{{ screen?.profile.value.muted ? '소리 OFF' : '소리 ON' }}</button><button @click="guide.open('help')">조작 설명</button><button @click="screen?.restartBattle()">다시 시작</button><button @click="screen?.returnLobby()">준비실로</button></div>
      <div v-if="ended && !story.hasOverlay.value && !guide.isOpen.value" ref="resultDialog" class="result-banner" role="dialog" aria-modal="true" aria-labelledby="result-title" aria-describedby="result-description" tabindex="-1"><h2 id="result-title" class="result-headline" :class="{ lost: battle?.status === 'lost' }">{{ battle?.status === 'won' ? '승리!!' : '패배...' }}</h2><strong class="result-subtitle">{{ screen?.resultTitle.value }}</strong><p id="result-description">{{ screen?.resultDescription.value }}</p><p class="reward-line">획득 경험치 <strong>+{{ screen?.reward.value ?? 0 }} XP</strong></p><p v-if="screen?.prototypeComplete.value" class="campaign-clear">10스테이지 클리어 · {{ screen.profile.value.seenStoryIds.includes('chapter-2') ? '엔딩 열람 완료' : '엔딩 해금' }}</p><div v-if="screen?.newAllies.value.length" class="new-ally-cards" aria-label="새로 만난 동료"><button v-for="ally in screen.newAllies.value" :key="ally.kind" class="new-ally-card" :aria-label="`${ally.label}, ${ally.role}, ${ally.cost}원, 편성에서 살펴보기`" @click="screen.openFormation(ally.kind)"><img :src="ally.image" alt="" /><strong>{{ ally.label }}</strong><small>{{ ally.role }} · {{ ally.cost }}원</small><span>{{ ally.label }} 편성하기</span></button></div><div class="result-actions"><button v-if="screen?.prototypeComplete.value" class="primary" data-dialog-primary @click="screen.returnLobby()">준비실로</button><button v-else-if="screen?.hasNextStage.value" class="primary" data-dialog-primary @click="screen?.nextStage()">다음 출근!!</button><button :class="{ primary: !screen?.hasNextStage.value && !screen?.prototypeComplete.value }" :data-dialog-primary="screen?.hasNextStage.value || screen?.prototypeComplete.value ? undefined : 'true'" @click="screen?.restartBattle()">다시 도전</button><button v-if="screen?.prototypeComplete.value" @click="guide.open('credits')">크레딧</button><button @click="screen?.openFormation()">출전 편성</button><button @click="screen?.openTraining()">파워 업</button><button @click="screen?.openShop()">스킬 상점</button><button @click="screen?.openStages()">출근 경로</button></div></div>
      <section v-if="isBattle && battle" class="battle-controls" :inert="modalVisible">
        <div class="unit-pages"><button :disabled="screen?.pageDisabled.value" aria-label="이전 병력 페이지" @click="screen?.setUnitPage(screen.unitPage.value === 0 ? 1 : 0)">◀</button><strong role="status" aria-live="polite" aria-atomic="true">{{ screen?.unitPage.value === 0 ? '병력 1~5 / 전체 10' : '병력 6~10 / 전체 10' }} <kbd>Q</kbd></strong><button :disabled="screen?.pageDisabled.value" ref="nextPager" aria-label="다음 병력 페이지" @click="screen?.setUnitPage(screen.unitPage.value === 0 ? 1 : 0)">▶</button></div><div class="battle-dock"><button class="worker-control" :data-state="screen?.economyState.value.status" :disabled="economyDisabled" :title="`경제 투자 · ${screen?.economyDescription.value} · ${screen?.economyReason.value}`" :aria-label="`경제 투자, ${screen?.economyReason.value}`" @mouseenter="screen?.describeEconomy('hover', true)" @mouseleave="screen?.describeEconomy('hover', false)" @focus="screen?.describeEconomy('focus', true)" @blur="screen?.describeEconomy('focus', false)" @click="screen?.upgradeEconomy()"><img class="investment-icon" :src="uiAssetUrl(investmentArt(battle.economyLevel))" alt="" aria-hidden="true" /><strong>투자 Lv.{{ battle.economyLevel }}</strong><span>{{ battle.upgradeCost === null ? 'MAX' : `${battle.upgradeCost}원` }}</span><small>{{ screen?.economyReason.value }}</small><kbd>U</kbd></button>
          <div ref="unitGrid" class="action-grid expanded-actions"><button v-for="unit in screen?.visibleUnits.value" :key="unit.slotIndex" class="action-card unit-button" :data-state="unit.status" :disabled="unit.disabled" :title="`${unit.label} · ${unit.description} · ${unit.reason}`" :aria-label="`${unit.slotIndex + 1}번 ${unit.label}, ${unit.cost}원, ${unit.reason}`" @mouseenter="screen?.describeUnit(unit.slotIndex, 'hover', true)" @mouseleave="screen?.describeUnit(unit.slotIndex, 'hover', false)" @focus="screen?.describeUnit(unit.slotIndex, 'focus', true)" @blur="screen?.describeUnit(unit.slotIndex, 'focus', false)" @click="screen?.summon(unit.kind)"><img v-if="unit.kind" class="unit-portrait" :src="assetUrl(characterArt(unit.kind, unit.level))" alt="" /><span v-else class="empty-portrait">—</span><span class="card-label"><kbd class="short-key">{{ unit.key }}</kbd>{{ unit.label }}</span><span class="unit-slot"><kbd>{{ unit.key }}</kbd> {{ unit.slotIndex + 1 }}번</span><strong>{{ unit.kind ? `${unit.cost}원` : '—' }}</strong><small>{{ unit.reason }}</small><span class="ready-bar" aria-hidden="true"><i :style="{ width: `${unit.progress * 100}%` }"></i></span></button></div>
          <button v-if="primarySkill" class="hero-trigger" :class="{ unavailable: primarySkill.disabled }" :data-state="primarySkill.status" :aria-disabled="primarySkill.disabled" :title="`${primarySkill.description} · ${primarySkill.reason}`" :aria-label="`${primarySkill.label}, ${primarySkill.key}, ${primarySkill.cost} 자금, ${primarySkill.reason}`" @mouseenter="screen?.previewSkill(primarySkill.kind, 'hover', true)" @mouseleave="screen?.previewSkill(primarySkill.kind, 'hover', false)" @focus="screen?.previewSkill(primarySkill.kind, 'focus', true)" @blur="screen?.previewSkill(primarySkill.kind, 'focus', false)" @click="!primarySkill.disabled && screen?.useSkill(primarySkill.kind)"><span class="trigger-art">{{ skillMarks[primarySkill.kind] }}</span><strong>{{ primarySkill.label }}</strong><span>{{ primarySkill.cost }}원</span><small>{{ primarySkill.reason }}</small><span class="ready-bar" aria-hidden="true"><i :style="{ width: `${primarySkill.progress * 100}%` }"></i></span><kbd>{{ primarySkill.key }}</kbd></button>
          <button v-else class="hero-trigger empty-primary" disabled aria-label="장착 스킬 없음, 준비실에서 장착"><span class="trigger-art" aria-hidden="true">—</span><strong>장착 스킬 없음</strong><small>준비실에서 장착</small></button>
        </div>
      </section>
      <section v-else-if="!titleVisible" class="lobby-panel" :inert="modalVisible"><button class="lobby-back" :aria-label="screen?.lobbyTab.value === 'menu' ? '타이틀로' : '준비실로'" @click="goBack()">◀</button><div class="lobby-note"><span role="status">{{ screen?.upgradeFeedback.value || '반복 클리어로 경험치를 모아 동료를 강화하자.' }}</span><span v-if="screen?.profile.value.storageMessage" class="storage-notice" role="status">{{ screen.profile.value.storageMessage }}</span></div><nav class="lobby-shortcuts" aria-label="빠른 메뉴"><button :aria-pressed="screen?.lobbyTab.value === 'stages'" @click="screen?.setLobbyTab('stages')">출근 경로</button><button :aria-pressed="screen?.lobbyTab.value === 'training'" @click="screen?.setLobbyTab('training')">파워 업</button><button :aria-pressed="screen?.lobbyTab.value === 'formation'" @click="screen?.setLobbyTab('formation')">편성</button><button class="shop-capsule" :aria-pressed="screen?.lobbyTab.value === 'shop'" @click="screen?.setLobbyTab('shop')">스킬 상점</button></nav></section>
      <GameGuide v-if="guide.isOpen.value && !story.hasOverlay.value" ref="guideScreen" :model="guide" :muted="screen?.profile.value.muted ?? false" @toggle-muted="screen?.toggleMuted()" />
      <StoryScreen v-if="story.hasOverlay.value" ref="storyScreen" :model="story" :muted="screen?.profile.value.muted ?? false" @toggle-muted="screen?.toggleMuted()" />
    </section>
  </main>
</template>

<style scoped>
/* Story access is a secondary entry, leaving the existing game navigation intact. */
.story-entry-button { font-size: 16px; min-height: 40px; padding: 8px 18px; background: #fff1c0; }
.title-story { position: absolute; top: 14px; right: 16px; z-index: 4; }
.hero-welcome { padding-bottom: 48px; }
.lobby-secondary { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; white-space: nowrap; z-index: 3; }
.guide-entry-button { min-height: 32px; padding: 5px 9px; font-size: 12px; }
.title-guide { margin-top: 8px; }
.lobby-secondary .story-entry-button { font-size: 12px; min-height: 32px; padding: 5px 9px; }
</style>
