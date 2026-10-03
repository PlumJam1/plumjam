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
const isBattle = computed(() => state.value?.scene === 'Battle');
const paused = computed(() => state.value?.phase === 'paused');

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
        <span>{{ isBattle ? `${state?.stageId} · ${paused ? '일시정지' : '전장 준비'}` : '출근 전 준비실' }}</span>
        <span class="ai-label">AI / DATA CENTER</span>
      </div>
      <div ref="gameParent" class="game-canvas" aria-label="게임 전장"></div>
      <div v-if="paused" class="pause-banner">일시정지 — 숨 고르고 다시 출근하자.</div>
      <section class="control-panel">
        <div class="briefing">
          <span class="eyebrow">{{ isBattle ? 'FIELD REPORT' : 'MISSION BRIEFING' }}</span>
          <h2>{{ isBattle ? '전선을 세울 준비' : '졸업은 했는데, 세상이 업데이트됐다.' }}</h2>
          <p>{{ isBattle ? '병력과 스킬이 들어갈 자리야. 지금은 화면 전환과 재시작을 확인할 수 있어.' : '수업은 열심히 들었다. 실전은 지금부터. AI에게 마지막 출근까지 빼앗길 순 없다.' }}</p>
        </div>
        <div class="actions">
          <template v-if="isBattle">
            <button class="primary" @click="screen?.togglePause()">{{ paused ? '전투 계속' : '일시정지' }} <kbd>Esc</kbd></button>
            <button @click="screen?.restartBattle()">다시 시작</button>
            <button @click="screen?.returnLobby()">준비실로</button>
          </template>
          <button v-else class="primary" :disabled="state?.scene !== 'Lobby'" @click="screen?.startBattle()">1-1 출근하기 <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </section>
    <footer class="footer"><span>PC 브라우저 · 키보드 / 마우스</span><span>개발 중 · 전투는 다음 단계에서 연결돼</span></footer>
  </main>
</template>
