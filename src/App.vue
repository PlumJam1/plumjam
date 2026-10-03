<script setup lang="ts">
import { assetUrl, backgroundArt, characterArt, type ArtKey } from './game/presentation/assets';
import { computed, markRaw, onBeforeUnmount, onMounted, shallowRef } from 'vue';
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
const statusLabel = computed(() => screen.value?.statusLabel.value ?? '로딩 중');
const titleVisible = viewModel.titleVisible;
const titleCast: ArtKey[] = ['melee', 'hero', 'ranged', 'support', 'robot-melee', 'boss'];
const unlockAudio = () => context.sound.unlock();

onMounted(() => { if (gameParent.value) game.value = markRaw(createGame(gameParent.value, context)); });
onBeforeUnmount(() => {
  viewModel.dispose();
  context.dispose();
  game.value?.destroy(true);
  game.value = null;
});
</script>

<template>
  <main class="app-shell" :style="{ '--early-bg': `url(${assetUrl('bg-early')})` }" @pointerdown.capture="unlockAudio" @keydown.capture="unlockAudio">
    <header class="masthead">
      <div><span class="eyebrow">HUMAN RESOURCES / LAST STAND</span><h1>인간의 마지막 출근</h1></div>
      <span class="build-label">PLUMJAM · PROTOTYPE</span>
    </header>
    <section class="game-frame" aria-label="게임">
      <div class="status-bar">
        <span class="human-label">HUMAN / 서울과기대</span>
        <span>{{ statusLabel }}</span>
        <span v-if="isBattle" class="ai-label">AI / DATA CENTER</span>
        <span v-else class="human-label">육성 재화 {{ screen?.profile.value.xp ?? 0 }} XP</span>
      </div>
      <div v-if="isBattle && battle" class="battle-stats" aria-label="전투 상태">
        <span>기지 <strong>{{ Math.ceil(battle.humanBase.hp) }} / {{ battle.humanBase.maxHp }}</strong></span>
        <span :class="{ 'danger-text': danger }">개발자 HP <strong>{{ Math.ceil(battle.hero.hp) }} / {{ battle.hero.maxHp }}</strong></span>
        <span class="money">자금 <strong>{{ Math.floor(battle.gold) }} / {{ battle.goldCap }}</strong> <small>+{{ battle.income }}/초</small></span>
        <span>적 기지 <strong>{{ Math.ceil(battle.aiBase.hp) }} / {{ battle.aiBase.maxHp }}</strong></span>
      </div>
      <div class="field-wrapper">
        <div ref="gameParent" class="game-canvas" aria-label="게임 전장"></div>
        <div v-if="isBattle && screen?.boss.value" class="boss-hud" aria-label="GPT-4o 보스 상태">
          <div><strong>GPT-4o</strong><span>{{ screen.boss.value.hp }} / {{ screen.boss.value.maxHp }} HP · {{ screen.boss.value.percent }}%</span><small>{{ screen.boss.value.attack }}</small></div>
          <span class="boss-health"><i :style="{ width: `${screen.boss.value.progress * 100}%` }"></i></span>
        </div>
        <div v-if="isBattle && (screen?.bossNotice.value || screen?.waveNotice.value)" class="field-notice" role="status">{{ screen?.bossNotice.value || screen?.waveNotice.value }}</div>
        <div v-if="!isBattle && titleVisible" class="title-screen">
          <span class="eyebrow">HUMANS VS AUTOMATION</span>
          <h2>인간의 <em>마지막 출근</em></h2>
          <p>졸업은 했는데, 세상이 업데이트됐다.</p>
          <div class="title-cast" aria-label="인간 병력과 AI 침공군"><img v-for="key in titleCast" :key="key" :src="assetUrl(key)" alt="" /></div>
          <button class="primary title-start" :disabled="state?.scene !== 'Lobby'" @click="viewModel.enterLobby()">{{ state?.scene === 'Lobby' ? '출근 시작' : '그림 불러오는 중...' }}</button>
          <small>PC · A/D 이동 · 1/2/3 병력 · J/K/L 스킬 · P git push · O overclock</small>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'menu'" class="lobby-home">
          <div class="mission-nav"><button class="primary" @click="screen?.setLobbyTab('stages')">전투 시작!</button><button class="primary" @click="screen?.setLobbyTab('training')">캐릭터 강화</button><button class="primary" @click="screen?.setLobbyTab('shop')">스킬 상점</button></div>
          <div class="hero-welcome"><p>수업은 열심히 들었는데...<br />실전도 출근도 지금부터다!</p><img :src="assetUrl(characterArt('hero', screen.profile.value.levels.hero))" alt="주인공 개발자" /></div>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'stages'" class="stage-map-ui" :style="{ backgroundImage: `linear-gradient(#142337b0,#172337bb),url(${assetUrl(backgroundArt(screen.selectedStage.value.theme))})` }">
        <div class="selected-stage-preview">
          <span class="eyebrow">{{ screen.selectedStage.value.theme === 'boss' ? 'BOSS INCOMING' : 'NEXT SHIFT' }}</span>
          <h2>{{ screen.selectedStage.value.id }} · {{ screen.selectedStage.value.label }}</h2>
          <p>{{ screen.selectedStage.value.enemies }}</p>
          <strong>클리어 보상 {{ screen.selectedStage.value.clearReward }} XP</strong>
          <small v-if="screen.selectedStage.value.locked">앞 스테이지를 클리어하면 출근할 수 있어.</small>
        </div>
        <div class="stage-grid stage-route">
          <button v-for="stage in screen.stages.value" :key="stage.id" class="stage-card" :class="{ boss: stage.theme === 'boss', selected: stage.id === screen.selectedStageId.value }" :aria-pressed="stage.id === screen.selectedStageId.value" @click="screen.selectStage(stage.id)">
            <span class="stage-number">{{ stage.id }}</span><small>{{ stage.locked ? '잠김' : stage.cleared ? 'CLEAR · 재도전' : '출근 가능' }}</small>
          </button>
        </div>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'training'" class="training-grid training-overlay">
          <article v-for="character in screen?.characters.value" :key="character.kind" class="training-card">
            <div class="character-heading"><img :src="character.image" alt="" /><div><h3>{{ character.label }}</h3><span>Lv.{{ character.level }} / 10 · {{ character.evolved ? '성장 외형' : '기본 외형' }}</span></div></div>
            <p>HP {{ character.hp }} <span v-if="character.cost !== null">→ {{ character.nextHp }}</span> · {{ character.statLabel }} {{ character.stat }} <span v-if="character.cost !== null">→ {{ character.nextStat }}</span></p>
            <div class="growth-preview"><img :src="character.preview" alt="레벨 5 성장 외형 미리보기" /><span>Lv.5 · {{ character.growth }}</span></div>
            <button :disabled="character.disabled || state?.scene !== 'Lobby'" class="primary" @click="screen?.upgradeCharacter(character.kind)">{{ character.reason }}</button>
          </article>
        </div>
        <div v-else-if="!isBattle && screen?.lobbyTab.value === 'shop'" class="shop-overlay">
          <article v-for="skill in screen.shopSkills.value" :key="skill.kind" class="shop-card">
            <span class="eyebrow">SKILL SHOP · {{ screen.profile.value.xp }} XP</span>
            <h2>{{ skill.label }}</h2><p>{{ skill.description }}</p>
            <strong>{{ skill.unlocked ? '해금 완료' : `${skill.cost} XP 해금` }}</strong>
            <button class="primary" :disabled="skill.disabled || state?.scene !== 'Lobby'" @click="screen?.purchaseSkill(skill.kind)">{{ skill.reason }}</button>
            <small>한 번 해금하면 다음 출근에도 사용할 수 있어.</small>
          </article>
        </div>
      </div>
      <p v-if="viewModel.assetNotice.value" class="asset-notice" role="status">{{ viewModel.assetNotice.value }}</p>
      <div v-if="isBattle && battle?.stageId === '1-5' && battle.elapsed < 4 && !ended" class="boss-quote"><strong>GPT-4o</strong> “너 정말 핵심을 짚었어”</div>
      <div v-if="paused" class="pause-banner" role="dialog" aria-label="일시정지">
        <span class="eyebrow">COFFEE BREAK</span><h2>숨 고르고 다시 출근하자.</h2>
        <p>시간 · 자금 · 스킬 준비가 모두 멈췄어.</p>
        <button class="primary" @click="screen?.togglePause()">전투 계속 <kbd>Esc</kbd></button>
        <button @click="screen?.returnLobby()">준비실로</button>
      </div>
      <div v-if="ended" class="result-banner" role="status">
        <span class="eyebrow">{{ battle?.status === 'won' ? 'MISSION COMPLETE' : 'SHIFT ENDED' }}</span>
        <h2>{{ screen?.resultTitle.value }}</h2>
        <p>{{ screen?.resultDescription.value }}</p>
        <p class="reward-line">획득 육성 재화 <strong>+{{ screen?.reward.value ?? 0 }} XP</strong></p>
        <div class="result-actions">
        <button v-if="screen?.hasNextStage.value" class="primary" @click="screen?.nextStage()">다음 출근</button>
        <button :class="{ primary: !screen?.hasNextStage.value }" @click="screen?.restartBattle()">다시 도전</button>
        <button @click="screen?.openTraining()">캐릭터 육성</button>
        <button @click="screen?.openShop()">스킬 상점</button>
        <button @click="screen?.openStages()">스테이지 선택</button>
        </div>
      </div>
      <section v-if="isBattle && battle" class="battle-controls">
        <div class="action-grid expanded-actions">
          <button v-for="unit in screen?.units.value" :key="unit.kind" class="action-card unit-button" :disabled="unit.disabled" :title="unit.description" @click="screen?.summon(unit.kind)">
            <img class="unit-portrait" :src="assetUrl(characterArt(unit.kind, screen?.profile.value.levels[unit.kind]))" alt="" /><span class="card-label"><kbd>{{ unit.key }}</kbd> {{ unit.label }}</span>
            <strong>{{ unit.cost }} 자금</strong><small>{{ unit.reason }}</small>
            <span class="ready-bar" aria-hidden="true"><i :style="{ width: `${unit.progress * 100}%` }"></i></span>
          </button>
          <button v-for="skill in screen?.skills.value" :key="skill.kind" class="action-card skill-button" :class="{ unavailable: skill.disabled }" :aria-disabled="skill.disabled" :title="skill.description" @mouseenter="screen?.previewSkill(skill.kind, 'hover', true)" @mouseleave="screen?.previewSkill(skill.kind, 'hover', false)" @focus="screen?.previewSkill(skill.kind, 'focus', true)" @blur="screen?.previewSkill(skill.kind, 'focus', false)" @click="!skill.disabled && screen?.useSkill(skill.kind)">
            <span class="card-label"><kbd>{{ skill.key }}</kbd> {{ skill.label }}</span>
            <span class="skill-effect">{{ skill.effectLabel }}<template v-if="skill.kind === 'hello-world' || skill.kind === 'heal'"> · Lv.{{ battle.hero.level }}</template></span>
            <strong>{{ skill.cost }} 자금</strong><small>{{ skill.reason }}</small>
            <span class="ready-bar" aria-hidden="true"><i :style="{ width: `${skill.progress * 100}%` }"></i></span>
          </button>
          <button class="action-card economy-button" :disabled="economyDisabled" :title="screen?.economyDescription.value" @click="screen?.upgradeEconomy()">
            <span class="card-label"><kbd>U</kbd> 투자 Lv.{{ battle.economyLevel }}</span>
            <strong>{{ battle.upgradeCost === null ? '최대 레벨' : `${battle.upgradeCost} 자금` }}</strong>
            <small>{{ screen?.economyReason.value }}</small>
            <span class="investment-note">수입 · 상한 증가</span>
          </button>
        </div>
        <div class="combat-detail" aria-live="off">
          <span v-if="screen?.previewDescription.value">{{ screen.previewDescription.value }}<template v-if="screen.previewTargets.value"> · {{ screen.previewTargets.value }}</template></span>
          <span v-else>스킬 선택으로 범위·효과 확인 · P 밀치기 · O overclock</span>
          <span v-for="buff in screen?.heroBuffs.value" :key="buff" class="buff-chip">{{ buff }}</span>
        </div>
        <div v-if="screen?.intro.value" class="first-briefing">
          <span v-if="screen?.feedback.value" role="status" aria-live="polite">{{ screen.feedback.value }}</span>
          <span v-else><b>A/D 이동</b> · <b>1/2/3 병력</b> · <b>J/K/L 스킬</b> · <b>P git push · O overclock</b> · 병력 뒤에서 싸우자! 소환·스킬·투자는 공유 자금을 써.</span>
          <button @click="screen?.dismissIntro()">알겠어</button>
        </div>
        <div v-else class="battle-help"><span>A / D · ← / → 이동 <b :class="{ 'danger-text': danger }">{{ danger ? '위험! 개발자가 쓰러지면 패배해. 후퇴하자!' : '병력보다 앞에 나가면 공격받아!' }}</b></span><span role="status" aria-live="polite">{{ screen?.feedback.value }}</span></div>
        <div class="battle-menu">
          <span>소환 · 스킬 · 투자 = 공유 자금. 기본 공격은 없어.</span>
          <div class="actions">
            <button @click="screen?.toggleMuted()">{{ screen?.profile.value.muted ? '음소거 중' : '소리 켜짐' }}</button>
            <button :disabled="ended" @click="screen?.togglePause()">{{ paused ? '전투 계속' : '일시정지' }} <kbd>Esc</kbd></button>
            <button @click="screen?.restartBattle()">다시 시작</button>
            <button @click="screen?.returnLobby()">준비실로</button>
          </div>
        </div>
      </section>
      <section v-else-if="!titleVisible" class="lobby-panel">
        <div class="lobby-top">
          <div class="lobby-tabs" role="tablist" aria-label="준비실">
            <button role="tab" :aria-selected="screen?.lobbyTab.value === 'menu'" @click="screen?.setLobbyTab('menu')">준비실</button>
            <button role="tab" :aria-selected="screen?.lobbyTab.value === 'stages'" @click="screen?.setLobbyTab('stages')">출근 경로</button>
            <button role="tab" :aria-selected="screen?.lobbyTab.value === 'training'" @click="screen?.setLobbyTab('training')">캐릭터 육성</button>
            <button role="tab" :aria-selected="screen?.lobbyTab.value === 'shop'" @click="screen?.setLobbyTab('shop')">스킬 상점</button>
          </div>
          <button class="mute-toggle" @click="screen?.toggleMuted()">{{ screen?.profile.value.muted ? '음소거 중' : '소리 켜짐' }}</button>
        </div>
        <div class="lobby-bottom"><button @click="viewModel.showTitle()">타이틀로</button><div class="lobby-note"><span role="status">{{ screen?.upgradeFeedback.value || '반복 클리어로 재화를 모아 캐릭터를 강화하자.' }}</span><span v-if="screen?.profile.value.storageMessage" class="storage-notice" role="status">{{ screen.profile.value.storageMessage }}</span></div><button v-if="screen?.lobbyTab.value === 'stages'" class="primary deploy-button" :disabled="screen?.selectedStage.value.locked || state?.scene !== 'Lobby'" @click="screen?.startBattle(screen.selectedStage.value.id)">{{ screen?.selectedStage.value.locked ? '아직 잠긴 출근길' : `${screen?.selectedStage.value.id} 출근!` }}</button></div>
      </section>
    </section>
    <footer class="footer"><span>PC 브라우저 · 키보드 / 마우스</span><span>프로토타입 · 병력과 경제를 운영해서 데이터센터를 파괴해</span></footer>
  </main>
</template>
