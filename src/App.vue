<script setup lang="ts">
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

onMounted(() => { if (gameParent.value) game.value = markRaw(createGame(gameParent.value, context)); });
onBeforeUnmount(() => {
  viewModel.dispose();
  context.dispose();
  game.value?.destroy(true);
  game.value = null;
});
</script>

<template>
  <main class="app-shell">
    <header class="masthead">
      <div><span class="eyebrow">HUMAN RESOURCES / LAST STAND</span><h1>인간의 마지막 출근</h1></div>
      <span class="build-label">PLUMJAM · PROTOTYPE</span>
    </header>
    <section class="game-frame" aria-label="게임">
      <div class="status-bar">
        <span class="human-label">HUMAN / 서울과기대</span>
        <span>{{ statusLabel }}</span>
        <span class="ai-label">AI / DATA CENTER</span>
      </div>
      <div v-if="isBattle && battle" class="battle-stats" aria-label="전투 상태">
        <span>기지 <strong>{{ Math.ceil(battle.humanBase.hp) }} / {{ battle.humanBase.maxHp }}</strong></span>
        <span :class="{ 'danger-text': danger }">개발자 HP <strong>{{ Math.ceil(battle.hero.hp) }} / {{ battle.hero.maxHp }}</strong></span>
        <span class="money">자금 <strong>{{ Math.floor(battle.gold) }} / {{ battle.goldCap }}</strong> <small>+{{ battle.income }}/초</small></span>
        <span>적 기지 <strong>{{ Math.ceil(battle.aiBase.hp) }} / {{ battle.aiBase.maxHp }}</strong></span>
      </div>
      <div ref="gameParent" class="game-canvas" aria-label="게임 전장"></div>
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
        <button class="primary" @click="screen?.restartBattle()">다시 도전</button>
        <button @click="screen?.returnLobby()">준비실로</button>
      </div>
      <section v-if="isBattle && battle" class="battle-controls">
        <div class="action-grid">
          <button v-for="unit in screen?.units.value" :key="unit.kind" class="action-card unit-button" :disabled="unit.disabled" :title="unit.description" @click="screen?.summon(unit.kind)">
            <span class="card-label"><kbd>{{ unit.key }}</kbd> {{ unit.label }}</span>
            <strong>{{ unit.cost }} 자금</strong><small>{{ unit.reason }}</small>
            <span class="ready-bar" aria-hidden="true"><i :style="{ width: `${unit.progress * 100}%` }"></i></span>
          </button>
          <button v-for="skill in screen?.skills.value" :key="skill.kind" class="action-card skill-button" :disabled="skill.disabled" :title="skill.description" @click="screen?.useSkill(skill.kind)">
            <span class="card-label"><kbd>{{ skill.key }}</kbd> {{ skill.label }}</span>
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
        <div v-if="screen?.intro.value" class="first-briefing">
          <span v-if="screen?.feedback.value" role="status" aria-live="polite">{{ screen.feedback.value }}</span>
          <span v-else><b>A / D 이동</b> · <b>1 / 2 / 3 병력</b> · <b>J / K / L 스킬</b> · 병력 뒤에서 싸우자! 소환 · 스킬 · 투자는 같은 자금을 써.</span>
          <button @click="screen?.dismissIntro()">알겠어</button>
        </div>
        <div v-else class="battle-help"><span>A / D · ← / → 이동 <b :class="{ 'danger-text': danger }">{{ danger ? '위험! 개발자가 쓰러지면 패배해. 후퇴하자!' : '병력보다 앞에 나가면 공격받아!' }}</b></span><span role="status" aria-live="polite">{{ screen?.feedback.value }}</span></div>
        <div class="battle-menu">
          <span>소환 · 스킬 · 투자 = 공유 자금. 기본 공격은 없어.</span>
          <div class="actions">
            <button :disabled="ended" @click="screen?.togglePause()">{{ paused ? '전투 계속' : '일시정지' }} <kbd>Esc</kbd></button>
            <button @click="screen?.restartBattle()">다시 시작</button>
            <button @click="screen?.returnLobby()">준비실로</button>
          </div>
        </div>
      </section>
      <section v-else class="control-panel">
        <div class="briefing">
          <span class="eyebrow">MISSION BRIEFING</span>
          <h2>졸업은 했는데, 세상이 업데이트됐다.</h2>
          <p>수업은 열심히 들었다. 실전은 지금부터. AI에게 마지막 출근까지 빼앗길 순 없다.</p>
        </div>
        <div class="actions">
          <button class="primary" :disabled="state?.scene !== 'Lobby'" @click="screen?.startBattle()">1-1 출근하기 <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </section>
    <footer class="footer"><span>PC 브라우저 · 키보드 / 마우스</span><span>프로토타입 · 병력과 경제를 운영해서 데이터센터를 파괴해</span></footer>
  </main>
</template>
