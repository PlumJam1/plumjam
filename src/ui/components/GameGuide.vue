<script setup lang="ts">
import { nextTick, shallowRef, watch } from 'vue';
import { GAME_CREDITS, PLAY_GUIDE } from '../guideContent';
import type { GuideViewModel } from '../viewmodels/GuideViewModel';
const props = defineProps<{ model: GuideViewModel; muted: boolean }>();
const emit = defineEmits<{ 'toggle-muted': [] }>();
const root = shallowRef<HTMLElement | null>(null);
const reading = shallowRef<HTMLElement | null>(null);
defineExpose({ dialogElement: () => root.value });
watch(() => props.model.mode.value, async () => { await nextTick(); if (reading.value) reading.value.scrollTop = 0; });
const keydown = (event: KeyboardEvent) => {
  event.stopPropagation();
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const buttonTarget = event.target instanceof HTMLElement && !!event.target.closest('button, a');
  if (event.repeat && (event.key === 'Enter' || event.key === ' ' && buttonTarget)) { event.preventDefault(); return; }
  if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) props.model.close(); }
};
</script>

<template>
  <section ref="root" class="game-guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" tabindex="-1" @keydown="keydown" @keyup.stop>
    <header class="guide-heading"><span>PLUMJAM</span><h1 id="guide-title">{{ model.mode.value === 'help' ? '플레이 방법' : '크레딧' }}</h1><button class="guide-sound" type="button" :aria-pressed="muted" :aria-label="`현재 소리 ${muted ? 'OFF' : 'ON'}, ${muted ? '소리 켜기' : '음소거하기'}`" @click="emit('toggle-muted')">{{ muted ? '소리 OFF' : '소리 ON' }}</button></header>
    <nav class="guide-tabs" aria-label="안내 선택"><button :aria-pressed="model.mode.value === 'help'" @click="model.setMode('help')">플레이 방법</button><button :aria-pressed="model.mode.value === 'credits'" @click="model.setMode('credits')">크레딧</button></nav>
    <article ref="reading" class="guide-reading" tabindex="0" :aria-label="model.mode.value === 'help' ? '플레이 방법 본문' : '크레딧 본문'">
      <template v-if="model.mode.value === 'help'"><section v-for="section in PLAY_GUIDE" :key="section.title"><h2>{{ section.title }}</h2><ul><li v-for="line in section.lines" :key="line">{{ line }}</li></ul></section></template>
      <template v-else><section v-for="section in GAME_CREDITS" :key="section.title"><h2>{{ section.title }}</h2><p v-for="line in section.lines" :key="line">{{ line }}</p><div v-if="section.links" class="credit-links"><a v-for="link in section.links" :key="link.href" :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }} <span class="external-label">외부 링크</span></a></div></section></template>
    </article>
    <footer class="guide-footer"><small>읽는 동안 게임은 그대로 기다려.</small><button class="primary" data-dialog-primary @click="model.close()">닫기 <kbd>Esc</kbd></button></footer>
  </section>
</template>

<style scoped>
.game-guide { position: absolute; inset: 0; z-index: 80; display: flex; flex-direction: column; gap: 12px; padding: 24px 4% 20px; color: #fff1c0; background: #241b12; border: 6px solid #9d693d; }
.guide-heading { position: relative; flex-shrink: 0; border-bottom: 2px solid #ad8550; padding-bottom: 10px; }.guide-heading > span { font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #d7b783; }.guide-heading h1 { margin: 3px 120px 0 0; font-size: clamp(26px,3vw,38px); line-height: 1.25; color: #ffdc59; }.guide-sound { position: absolute; top: 0; right: 0; min-width: 100px; min-height: 30px; padding: 5px 8px; font-size: 12px; }
.guide-tabs { display: flex; gap: 8px; flex-shrink: 0; }.guide-tabs button { min-height: 34px; font-size: 14px; padding: 6px 15px; }.guide-tabs button[aria-pressed=true] { background: #ffd334; outline: 2px solid #ed45dd; outline-offset: -4px; }.guide-tabs button:focus-visible { outline: 3px solid #ed45dd; outline-offset: 3px; }
.guide-reading { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 22px; scroll-padding: 12px; color: #24180e; background: #fff1c8; border: 3px solid #bd9869; border-radius: 4px; font-size: 16px; line-height: 1.65; word-break: keep-all; overflow-wrap: anywhere; }.guide-reading section + section { margin-top: 22px; }.guide-reading h2 { margin: 0 0 8px; font-size: 20px; line-height: 1.35; color: #754c27; }.guide-reading ul { margin: 0; padding-left: 22px; }.guide-reading li + li { margin-top: 6px; }.guide-reading p { margin: 0 0 7px; }
.credit-links { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; }.credit-links a { color: #164f65; text-decoration: underline; text-underline-offset: 3px; }.external-label { font-size: 12px; }.guide-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 2px solid #ad8550; padding-top: 10px; }.guide-footer small { font-size: 12px; }.guide-footer button { min-width: 140px; min-height: 40px; font-size: 16px; }
@media(max-height:650px) { .game-guide { padding: 16px 3% 12px; gap: 8px; }.guide-heading h1 { font-size: 26px; }.guide-reading { padding: 12px 15px; }.guide-reading section + section { margin-top: 16px; }.guide-footer { padding-top: 8px; } }
</style>
