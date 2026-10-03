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
        <span :class="{ 'danger-text': battle.hero.hp < battle.hero.maxHp * .3 }">개발자 HP <strong>{{ Math.ceil(battle.hero.hp) }} / {{ battle.hero.maxHp }}</strong></span>
        <span class="money">자금 <strong>{{ Math.floor(battle.gold) }} / {{ battle.goldCap }}</strong> <small>+{{ battle.income }}/초</small></span>
        <span>적 기지 <strong>{{ Math.ceil(battle.aiBase.hp) }} / {{ battle.aiBase.maxHp }}</strong></span>
      </div>
      <div ref="gameParent" class="game-canvas" aria-label="게임 전장"></div>
      <div v-if="paused" class="pause-banner">일시정지 — 숨 고르고 다시 출근하자.</div>
      <div v-if="ended" class="result-banner" role="status">
        <span class="eyebrow">{{ battle?.status === 'won' ? 'MISSION COMPLETE' : 'SHIFT ENDED' }}</span>
        <h2>{{ battle?.status === 'won' ? '오늘의 출근을 지켰다!' : '전선을 지키지 못했다.' }}</h2>
        <p>{{ battle?.status === 'won' ? 'AI 데이터센터를 파괴했어. 다시 출근해서 다른 전략도 시험해봐.' : battle?.defeatReason === 'hero' ? '개발자가 쓰러졌어. 병력 뒤에서 전선을 도와줘.' : '아군 기지가 파괴됐어. 병력과 경제 투자 타이밍을 바꿔봐.' }}</p>
        <button class="primary" @click="screen?.restartBattle()">다시 도전</button>
        <button @click="screen?.returnLobby()">준비실로</button>
      </div>
      <section v-if="isBattle && battle" class="battle-controls">
        <div class="summon-row">
          <button v-for="unit in screen?.units.value" :key="unit.kind" class="unit-button" :disabled="unit.disabled" @click="screen?.summon(unit.kind)">
            <span><kbd>{{ unit.key }}</kbd> {{ unit.label }}</span>
            <strong>{{ unit.cost }} 자금</strong>
            <small>{{ unit.cooldown > 0 ? `준비 ${unit.cooldown.toFixed(1)}초` : '출격 가능' }}</small>
          </button>
          <button class="economy-button" :disabled="economyDisabled" @click="screen?.upgradeEconomy()">
            <span><kbd>U</kbd> 경제 투자 Lv.{{ battle.economyLevel }}</span>
            <strong>{{ battle.upgradeCost === null ? '최대 레벨' : `${battle.upgradeCost} 자금` }}</strong>
            <small>수입 · 보유 상한 증가</small>
          </button>
        </div>
        <div class="battle-help"><span>A / D · ← / → 이동 <b>병력보다 앞에 나가면 공격받아!</b></span><span role="status">{{ screen?.feedback.value }}</span></div>
        <div class="battle-menu">
          <span>같은 자금으로 병력과 경제에 투자해. 주인공은 기본 공격을 하지 않아.</span>
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
