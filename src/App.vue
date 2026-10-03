<script setup lang="ts">
import { assetUrl, characterArt, type ArtKey } from './game/presentation/assets';
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import type Phaser from 'phaser';
import { AppContext } from './core/AppContext';
import { createGame } from './game/createGame';
import { createShellViewModel } from './ui/viewmodels/ShellViewModel';

const context = markRaw(new AppContext());
const viewModel = createShellViewModel(context);
const gameParent = shallowRef<HTMLElement | null>(null);
const game = shallowRef<Phaser.Game | null>(null);
const screen = viewModel.screen;
const state = computed(() => screen.value?.state.value);
const isBattle = computed(() => screen.value?.isBattle.value ?? false);
const paused = computed(() => screen.value?.isPaused.value ?? false);
const battle = computed(() => screen.value?.battle.value);
const ended = computed(() => screen.value?.ended.value ?? false);
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
const helloSkill = computed(() => screen.value?.skills.value.find(skill => skill.kind === 'hello-world'));
const skillMarks = { 'hello-world': 'HW', sleep: 'Zzz', heal: '+', 'git-push': '>>', overclock: 'OC' };
const goBack = () => { if (screen.value?.lobbyTab.value === 'menu') viewModel.showTitle(); else screen.value?.setLobbyTab('menu'); };

// Sync the Phaser FIT viewport after Vue switches the lobby/battle shell width.
// https://docs.phaser.io/api-documentation/class/scale-scalemanager#setParentSize
watch(isBattle, async () => {
  await nextTick();
  const parent = gameParent.value;
  const activeGame = game.value;
  if (parent && activeGame && parent.clientWidth > 0 && parent.clientHeight > 0) {
    activeGame.scale.setParentSize(parent.clientWidth, parent.clientHeight);
  }
});
onMounted(() => { if (gameParent.value) game.value = markRaw(createGame(gameParent.value, context)); });
onBeforeUnmount(() => {
  viewModel.dispose();
  context.dispose();
  game.value?.destroy(true);
  game.value = null;
});
</script>

<template>
  <main class="app-shell" :class="{ 'is-battle': isBattle, 'is-lobby': !isBattle && !titleVisible, 'is-title': !isBattle && titleVisible }" :style="{ '--early-bg': `url(${assetUrl('bg-early')})` }" @pointerdown.capture="unlockAudio" @keydown.capture="unlockAudio">
    <section class="game-frame" aria-label="게임">
      <header v-if="!isBattle" class="game-header"><h1 class="screen-name">{{ screenName }}</h1><div class="xp-wallet"><span>XP</span><strong>{{ screen?.profile.value.xp ?? 0 }}</strong></div><button class="header-sound" @click="screen?.toggleMuted()">{{ screen?.profile.value.muted ? '소리 OFF' : '소리 ON' }}</button></header>
      <div class="field-wrapper">
        <div ref="gameParent" class="game-canvas" aria-label="게임 전장"></div>
        <template v-if="isBattle && battle">
          <button class="battle-pause" :disabled="ended" aria-label="일시정지" @click="screen?.togglePause()">{{ paused ? '▶' : 'Ⅱ' }}</button>
          <div class="stage-title"><strong>{{ battle.stageId }} 출근길</strong><small>{{ screen?.time.value }}</small></div>
          <div class="battle-wallet"><strong>{{ Math.floor(battle.gold) }}<span> / {{ battle.goldCap }}원</span></strong><small>수입 +{{ battle.income }} / 초</small></div>
          <div class="battle-stats" aria-label="전투 상태"><span>서울과기대 <strong>{{ Math.ceil(battle.humanBase.hp) }} / {{ battle.humanBase.maxHp }}</strong></span><span :class="{ 'danger-text': danger }">개발자 <strong>{{ Math.ceil(battle.hero.hp) }} / {{ battle.hero.maxHp }}</strong></span><span>데이터센터 <strong>{{ Math.ceil(battle.aiBase.hp) }} / {{ battle.aiBase.maxHp }}</strong></span></div>
        </template>
        <div v-if="isBattle && screen?.boss.value" class="boss-hud" aria-label="GPT-4o 보스 상태"><div><strong>GPT-4o</strong><span>{{ screen.boss.value.hp }} / {{ screen.boss.value.maxHp }} HP · {{ screen.boss.value.percent }}%</span><small>{{ screen.boss.value.attack }}</small></div><span class="boss-health"><i :style="{ width: `${screen.boss.value.progress * 100}%` }"></i></span></div>
        <div v-if="isBattle && (screen?.bossNotice.value || screen?.waveNotice.value)" class="field-notice" role="status">{{ screen?.bossNotice.value || screen?.waveNotice.value }}</div>
        <div v-if="isBattle && battle?.stageId === '1-5' && battle.elapsed < 4 && !ended" class="boss-quote"><strong>GPT-4o</strong> “너 정말 핵심을 짚었어”</div>
        <div v-if="!isBattle && titleVisible" class="title-screen"><span class="eyebrow">PLUMJAM</span><h2>인간의 <em>마지막 출근</em></h2><p>졸업은 했는데, 세상이 업데이트됐다.</p><div class="title-cast" aria-label="인간 병력과 AI 침공군"><img v-for="key in titleCast" :key="key" :src="assetUrl(key)" alt="" /></div><button class="primary title-start" :disabled="state?.scene !== 'Lobby'" @click="viewModel.enterLobby()">{{ state?.scene === 'Lobby' ? '게임 시작!!' : '그림 불러오는 중...' }}</button><small>PC · A/D 이동 · 1~5 병력 · J/K/L/P/O 스킬</small></div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'menu'" class="lobby-home"><nav class="mission-nav" aria-label="준비실 메뉴"><button class="primary" @click="screen?.setLobbyTab('stages')">전투 개시!!</button><button class="primary" @click="screen?.setLobbyTab('training')">파워 업</button><button class="primary" @click="screen?.setLobbyTab('formation')">출전 편성</button></nav><div class="hero-welcome"><p>수업은 열심히 들었는데...<br />실전도 출근도 지금부터다!</p><img :src="assetUrl(characterArt('hero', screen.profile.value.levels.hero))" alt="주인공 개발자" /></div></div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'stages'" class="stage-map-ui">
          <nav class="stage-strip" aria-label="스테이지 선택"><button v-for="stage in screen.stages.value" :key="stage.id" class="stage-card" :class="{ boss: stage.theme === 'boss', selected: stage.id === screen.selectedStageId.value }" :aria-pressed="stage.id === screen.selectedStageId.value" @click="screen.selectStage(stage.id)"><strong>{{ stage.id }}</strong><span>{{ stage.label }}</span><small>{{ stage.locked ? '잠김' : stage.cleared ? 'CLEAR' : '도전 가능' }}</small></button></nav>
          <div class="map-route" aria-label="출근 경로 지도"><div class="map-path" aria-hidden="true"></div><button v-for="(stage, index) in screen.stages.value" :key="stage.id" class="map-node" :class="{ selected: stage.id === screen.selectedStageId.value, locked: stage.locked, cleared: stage.cleared, boss: stage.theme === 'boss' }" :style="{ '--node-index': index }" :aria-label="`${stage.id} ${stage.label}, ${stage.locked ? '잠김' : stage.cleared ? '클리어' : '도전 가능'}`" :aria-pressed="stage.id === screen.selectedStageId.value" @click="screen.selectStage(stage.id)"><span class="node-dot"></span><strong>{{ stage.id }}</strong></button></div>
          <div class="selected-stage-preview"><h2>{{ screen.selectedStage.value.id }} · {{ screen.selectedStage.value.label }}</h2><p>{{ screen.selectedStage.value.enemies }}</p><strong>클리어 보상 {{ screen.selectedStage.value.clearReward }} XP</strong><small v-if="screen.selectedStage.value.locked">앞 스테이지를 클리어하면 열려.</small></div>
          <div class="deploy-summary"><span>편성 {{ screen.formationSummary.value }}</span><button class="summary-edit" @click="screen.setLobbyTab('formation')">편성 변경</button></div><button class="primary map-deploy" :disabled="screen.selectedStage.value.locked || state?.scene !== 'Lobby'" @click="screen.startBattle(screen.selectedStage.value.id)">{{ screen.selectedStage.value.locked ? '아직 잠긴 출근길' : '출진!!' }}</button>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'formation'" class="formation-overlay">
          <div class="formation-heading"><strong>출전 편성 · 5칸</strong><span>칸 선택 → 동료 선택 → 편성</span></div><div class="formation-slots" aria-label="출전 편성"><button v-for="slot in screen.formation.value" :key="slot.index" :aria-pressed="slot.index === screen.selectedSlot.value" @click="screen.selectSlot(slot.index)"><kbd>{{ slot.key }}</kbd><img v-if="slot.image" :src="slot.image" alt="" /><strong>{{ slot.label }}</strong></button></div>
          <div class="formation-selection"><span>{{ screen.selectedSlot.value + 1 }}번 칸 선택 중 · 같은 동료는 자리 교환</span><button :disabled="screen.formation.value[screen.selectedSlot.value].kind === null" @click="screen.removeAlly()">칸 비우기</button></div>
          <div v-if="selectedAlly" class="character-carousel"><button class="carousel-nav previous" aria-label="이전 동료" @click="screen.shiftAlly(-1)">◀</button><button v-for="neighbor in allyNeighbors" :key="neighbor.offset" class="carousel-card carousel-side" :class="neighbor.offset < 0 ? 'previous' : 'next'" :aria-label="`${neighbor.item?.label} 살펴보기`" @click="screen.shiftAlly(neighbor.offset)"><img :src="neighbor.item?.image" alt="" /><strong>{{ neighbor.item?.label }}</strong></button><article class="carousel-card carousel-main"><img :src="selectedAlly.image" alt="" /><h2>{{ selectedAlly.label }} <small>Lv.{{ selectedAlly.level }}</small></h2><p>{{ selectedAlly.role }} · {{ selectedAlly.cost }}원 · 준비 {{ selectedAlly.cooldown }}초</p><p class="character-description">{{ selectedAlly.description }}</p><button class="primary formation-equip" :disabled="!selectedAlly.unlocked" @click="screen.equipAlly(selectedAlly.kind)">{{ selectedAlly.reason }}</button></article><button class="carousel-nav next" aria-label="다음 동료" @click="screen.shiftAlly(1)">▶</button></div>
          <div class="roster-strip" aria-label="모든 동료"><button v-for="ally in screen.roster.value" :key="ally.kind" class="roster-card" :class="{ locked: !ally.unlocked }" :aria-pressed="ally.kind === screen.selectedAllyKind.value" @click="screen.selectAlly(ally.kind)"><img :src="ally.image" alt="" /><strong>{{ ally.label }}</strong><small>{{ !ally.unlocked ? '잠김' : ally.equippedIndex >= 0 ? `${ally.equippedIndex + 1}번 편성` : '미편성' }}</small></button></div>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'training'" class="training-overlay">
          <div v-if="selectedCharacter" class="character-carousel"><button class="carousel-nav previous" aria-label="이전 캐릭터" @click="screen.shiftCharacter(-1)">◀</button><button v-for="neighbor in characterNeighbors" :key="neighbor.offset" class="carousel-card carousel-side" :class="neighbor.offset < 0 ? 'previous' : 'next'" :aria-label="`${neighbor.item?.label} 살펴보기`" @click="screen.shiftCharacter(neighbor.offset)"><img :src="neighbor.item?.image" alt="" /><strong>{{ neighbor.item?.label }}</strong></button><article class="training-card carousel-main"><div class="character-heading"><h2>{{ selectedCharacter.label }}</h2><span>Lv.{{ selectedCharacter.level }} / 10</span></div><img class="training-portrait" :src="selectedCharacter.image" alt="" /><div class="character-stats"><span>HP {{ selectedCharacter.hp }}<template v-if="selectedCharacter.cost !== null"> → {{ selectedCharacter.nextHp }}</template></span><span>{{ selectedCharacter.statLabel }} {{ selectedCharacter.stat }}<template v-if="selectedCharacter.cost !== null"> → {{ selectedCharacter.nextStat }}</template></span></div><button class="primary" :disabled="selectedCharacter.disabled || state?.scene !== 'Lobby'" @click="screen.upgradeCharacter(selectedCharacter.kind)">{{ selectedCharacter.reason }}</button></article><button class="carousel-nav next" aria-label="다음 캐릭터" @click="screen.shiftCharacter(1)">▶</button></div>
          <div v-if="selectedCharacter" class="character-description"><p v-if="selectedCharacter.supportNote">{{ selectedCharacter.supportNote }}</p><div class="growth-preview"><img :src="selectedCharacter.preview" alt="레벨 5 성장 외형 미리보기" /><span>Lv.5 · {{ selectedCharacter.growth }}</span></div></div><div class="roster-strip" aria-label="모든 캐릭터"><button v-for="character in screen.characters.value" :key="character.kind" class="training-select roster-card" :class="{ locked: !character.unlocked }" :aria-pressed="character.kind === screen.selectedCharacterKind.value" @click="screen.selectCharacter(character.kind)"><img :src="character.image" alt="" /><strong>{{ character.label }}</strong><small>{{ character.unlocked ? `Lv.${character.level}` : '잠김' }}</small></button></div>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'shop'" class="shop-overlay"><article v-for="skill in screen.shopSkills.value" :key="skill.kind" class="shop-card"><span class="shop-emblem">{{ skillMarks[skill.kind] }}</span><h2>{{ skill.label }}</h2><p>{{ skill.description }}</p><strong>{{ skill.unlocked ? '해금 완료' : `${skill.cost} XP 해금` }}</strong><button class="primary" :disabled="skill.disabled || state?.scene !== 'Lobby'" @click="screen.purchaseSkill(skill.kind)">{{ skill.reason }}</button><small>한 번 해금하면 다음 출근에도 사용할 수 있어.</small></article></div>
      </div>
      <p v-if="viewModel.assetNotice.value" class="asset-notice" role="status">{{ viewModel.assetNotice.value }}</p>
      <div v-if="paused" class="pause-banner" role="dialog" aria-label="일시정지"><span class="eyebrow">COFFEE BREAK</span><h2>잠깐 쉬는 중</h2><p>시간 · 자금 · 스킬 준비가 모두 멈췄어.</p><button class="primary" @click="screen?.togglePause()">전투 계속 <kbd>Esc</kbd></button><button @click="screen?.returnLobby()">준비실로</button></div>
      <div v-if="ended" class="result-banner" role="status"><h2 class="result-headline" :class="{ lost: battle?.status === 'lost' }">{{ battle?.status === 'won' ? '승리!!' : '패배...' }}</h2><strong class="result-subtitle">{{ screen?.resultTitle.value }}</strong><p>{{ screen?.resultDescription.value }}</p><p class="reward-line">획득 경험치 <strong>+{{ screen?.reward.value ?? 0 }} XP</strong></p><p v-if="screen?.newAllies.value.length" class="unlock-line">새 동료! {{ screen.newAllies.value.map(ally => ally.label).join(' · ') }}</p><div class="result-actions"><button v-if="screen?.hasNextStage.value" class="primary" @click="screen?.nextStage()">다음 출근!!</button><button :class="{ primary: !screen?.hasNextStage.value }" @click="screen?.restartBattle()">다시 도전</button><button @click="screen?.openFormation()">출전 편성</button><button @click="screen?.openTraining()">파워 업</button><button @click="screen?.openShop()">스킬 상점</button><button @click="screen?.openStages()">출근 경로</button></div></div>
      <section v-if="isBattle && battle" class="battle-controls">
        <div class="battle-dock"><button class="worker-control" :disabled="economyDisabled" :title="screen?.economyDescription.value" @click="screen?.upgradeEconomy()"><span class="worker-symbol">₩</span><strong>투자 Lv.{{ battle.economyLevel }}</strong><span>{{ battle.upgradeCost === null ? 'MAX' : `${battle.upgradeCost}원` }}</span><small>{{ screen?.economyReason.value }}</small><kbd>U</kbd></button>
          <div class="action-grid expanded-actions"><button v-for="unit in screen?.units.value" :key="unit.key" class="action-card unit-button" :disabled="unit.disabled" :title="unit.description" @click="screen?.summon(unit.kind)"><img v-if="unit.kind" class="unit-portrait" :src="assetUrl(characterArt(unit.kind, unit.level))" alt="" /><span v-else class="empty-portrait">—</span><span class="card-label"><kbd>{{ unit.key }}</kbd> {{ unit.label }}</span><strong>{{ unit.kind ? `${unit.cost}원` : '—' }}</strong><small>{{ unit.reason }}</small><span class="ready-bar" aria-hidden="true"><i :style="{ width: `${unit.progress * 100}%` }"></i></span></button><button v-for="skill in screen?.skills.value" :key="skill.kind" class="action-card skill-button" :class="{ unavailable: skill.disabled }" :aria-disabled="skill.disabled" :title="skill.description" @mouseenter="screen?.previewSkill(skill.kind, 'hover', true)" @mouseleave="screen?.previewSkill(skill.kind, 'hover', false)" @focus="screen?.previewSkill(skill.kind, 'focus', true)" @blur="screen?.previewSkill(skill.kind, 'focus', false)" @click="!skill.disabled && screen?.useSkill(skill.kind)"><span class="skill-emblem">{{ skillMarks[skill.kind] }}</span><span class="card-label"><kbd>{{ skill.key }}</kbd> {{ skill.label }}</span><span class="skill-effect">{{ skill.effectLabel }}</span><strong>{{ skill.cost }}원</strong><small>{{ skill.reason }}</small><span class="ready-bar" aria-hidden="true"><i :style="{ width: `${skill.progress * 100}%` }"></i></span></button></div>
          <button v-if="helloSkill" class="hero-trigger" :class="{ unavailable: helloSkill.disabled }" :aria-disabled="helloSkill.disabled" :title="helloSkill.description" @mouseenter="screen?.previewSkill('hello-world', 'hover', true)" @mouseleave="screen?.previewSkill('hello-world', 'hover', false)" @focus="screen?.previewSkill('hello-world', 'focus', true)" @blur="screen?.previewSkill('hello-world', 'focus', false)" @click="!helloSkill.disabled && screen?.useSkill('hello-world')"><span class="trigger-art">HW!</span><strong>Hello World</strong><span>{{ helloSkill.cost }}원</span><small>{{ helloSkill.reason }}</small><span class="ready-bar" aria-hidden="true"><i :style="{ width: `${helloSkill.progress * 100}%` }"></i></span><kbd>J</kbd></button>
        </div>
        <div class="combat-detail" aria-live="off"><span v-if="screen?.previewDescription.value">{{ screen.previewDescription.value }}<template v-if="screen.previewTargets.value"> · {{ screen.previewTargets.value }}</template></span><span v-else>스킬에 마우스를 올리면 범위·효과 확인</span><span v-for="buff in screen?.heroBuffs.value" :key="buff" class="buff-chip">{{ buff }}</span></div>
        <div v-if="screen?.intro.value" class="first-briefing"><span v-if="screen?.feedback.value" role="status" aria-live="polite">{{ screen.feedback.value }}</span><span v-else><b>A/D 이동 · 1~5 병력 · J/K/L/P/O 스킬 · U 투자</b><br />병력 뒤에서 싸우자! 소환·스킬·투자는 공유 자금을 써.</span><button @click="screen?.dismissIntro()">알겠어</button></div><div v-else class="battle-help"><span>A / D · ← / → 이동 <b :class="{ 'danger-text': danger }">{{ danger ? '개발자 위험! 후퇴하자!' : '병력보다 앞에 나가면 공격받아!' }}</b></span><span role="status" aria-live="polite">{{ screen?.feedback.value }}</span></div>
        <div class="battle-menu"><button @click="screen?.toggleMuted()">{{ screen?.profile.value.muted ? '소리 OFF' : '소리 ON' }}</button><button :disabled="ended" @click="screen?.togglePause()">{{ paused ? '계속' : '일시정지' }} <kbd>Esc</kbd></button><button @click="screen?.restartBattle()">다시 시작</button><button @click="screen?.returnLobby()">준비실로</button></div>
      </section>
      <section v-else-if="!titleVisible" class="lobby-panel"><button class="lobby-back" :aria-label="screen?.lobbyTab.value === 'menu' ? '타이틀로' : '준비실로'" @click="goBack()">◀</button><div class="lobby-note"><span role="status">{{ screen?.upgradeFeedback.value || '반복 클리어로 경험치를 모아 동료를 강화하자.' }}</span><span v-if="screen?.profile.value.storageMessage" class="storage-notice" role="status">{{ screen.profile.value.storageMessage }}</span></div><nav class="lobby-shortcuts" aria-label="빠른 메뉴"><button :aria-pressed="screen?.lobbyTab.value === 'stages'" @click="screen?.setLobbyTab('stages')">출근 경로</button><button :aria-pressed="screen?.lobbyTab.value === 'training'" @click="screen?.setLobbyTab('training')">파워 업</button><button :aria-pressed="screen?.lobbyTab.value === 'formation'" @click="screen?.setLobbyTab('formation')">편성</button><button class="shop-capsule" :aria-pressed="screen?.lobbyTab.value === 'shop'" @click="screen?.setLobbyTab('shop')">스킬 상점</button></nav></section>
    </section>
  </main>
</template>
