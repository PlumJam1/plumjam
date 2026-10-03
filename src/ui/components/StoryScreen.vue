<script setup lang="ts">
import { nextTick, shallowRef, watch } from 'vue';
import { assetUrl } from '../../game/presentation/assets';
import { handleStoryKey } from '../storyInput';
import type { StoryViewModel } from '../viewmodels/StoryViewModel';
const props = defineProps<{ model: StoryViewModel; muted: boolean }>();
const emit = defineEmits<{ 'toggle-muted': [] }>();
const root = shallowRef<HTMLElement | null>(null);
const reading = shallowRef<HTMLElement | null>(null);
watch([() => props.model.currentStory.value?.id, () => props.model.pageIndex.value], async () => { await nextTick(); if (reading.value) reading.value.scrollTop = 0; });
defineExpose({ dialogElement: () => root.value });
const keydown = (event: KeyboardEvent) => {
  // Keep native Tab/button activation; block the window's battle shortcuts underneath.
  event.stopPropagation();
  const action = handleStoryKey(event, !!props.model.currentStory.value, event.target instanceof HTMLElement && !!event.target.closest('button, a, input, select, textarea'));
  if (!action || action === 'suppress') return;
  if (action === 'next') props.model.next();
  else if (action === 'previous') props.model.previous();
  else if (action === 'skip') props.model.skip();
  else props.model.closeArchive();
};
</script>

<template>
  <section ref="root" class="story-screen" role="dialog" aria-modal="true" :aria-labelledby="model.currentStory.value ? 'story-title' : 'archive-title'" tabindex="-1" @keydown="keydown" @keyup.stop>
    <button type="button" class="story-sound" :aria-pressed="muted" :aria-label="`현재 소리 ${muted ? 'OFF' : 'ON'}, ${muted ? '소리 켜기' : '음소거하기'}`" :title="muted ? '소리 OFF · 눌러서 소리 켜기' : '소리 ON · 눌러서 음소거하기'" @click="emit('toggle-muted')">{{ muted ? '소리 OFF' : '소리 ON' }}</button>
    <template v-if="model.currentStory.value && model.currentPage.value">
      <img class="story-backdrop" :src="assetUrl(model.currentPage.value.background)" alt="" aria-hidden="true" />
      <header class="story-heading"><span>{{ model.currentStory.value.eyebrow }}</span><h1 id="story-title">{{ model.currentStory.value.title }}</h1><strong aria-live="polite" aria-atomic="true">{{ model.pageIndex.value + 1 }} / {{ model.total.value }}</strong></header>
      <div class="story-content">
        <div class="story-portraits" aria-hidden="true"><img v-for="portrait in model.currentPage.value.portraits" :key="portrait" :src="assetUrl(portrait)" alt="" /></div>
        <article ref="reading" class="story-reading" tabindex="0" aria-label="이야기 본문"><h2>{{ model.currentPage.value.title }}</h2><p v-for="(paragraph, index) in model.currentPage.value.body" :key="index">{{ paragraph }}</p></article>
      </div>
      <p v-if="model.feedback.value" class="story-feedback" role="status">{{ model.feedback.value }}</p>
      <footer class="story-navigation"><button :disabled="!model.hasPrev.value" @click="model.previous()">이전 <kbd>←</kbd></button><button class="primary" data-dialog-primary @click="model.next()">{{ model.isLast.value ? model.origin.value === 'archive' ? '보관함으로' : '계속하기' : '다음' }} <kbd>→</kbd></button><button @click="model.skip()">{{ model.origin.value === 'archive' ? '읽기 마치기' : '넘기기' }} <kbd>Esc</kbd></button></footer>
    </template>
    <template v-else>
      <header class="story-heading"><span>STORY ARCHIVE</span><h1 id="archive-title">함께한 출근 이야기</h1><p>읽은 이야기는 다시 펼쳐볼 수 있어.</p></header>
      <div class="story-archive"><article v-for="entry in model.archiveEntries.value" :key="entry.id" class="story-entry"><span>{{ entry.eyebrow }}</span><h2>{{ entry.title }}</h2><p>{{ entry.unlocked ? entry.seen ? '읽은 이야기 · 다시 읽기' : '해금된 이야기' : entry.reason }}</p><button :data-story-id="entry.id" :disabled="!entry.unlocked" @click="model.playUnlockedStory(entry.id)">{{ entry.unlocked ? '읽기' : '아직 잠김' }}</button></article></div>
      <footer class="story-navigation"><button class="primary" data-dialog-primary @click="model.closeArchive()">돌아가기 <kbd>Esc</kbd></button></footer>
    </template>
  </section>
</template>

<style scoped>
.story-screen { position: absolute; inset: 0; z-index: 90; display: flex; flex-direction: column; gap: 14px; padding: 26px 4% 20px; overflow: hidden; background: #201810; color: #fff0bd; border: 6px solid #9d693d; }
.story-screen::before,.story-screen::after { content: ''; position: absolute; left: 0; right: 0; height: 8px; background: repeating-linear-gradient(90deg,#0c0907 0 12px,#b18a52 12px 24px); z-index: 1; pointer-events: none; }.story-screen::before { top: 0; }.story-screen::after { bottom: 0; }
.story-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .13; image-rendering: pixelated; pointer-events: none; }
.story-heading,.story-content,.story-navigation,.story-feedback,.story-archive { position: relative; z-index: 2; }
.story-heading { flex-shrink: 0; padding-bottom: 12px; border-bottom: 2px solid #ad8550; }.story-heading > span { color: #d7b783; font-size: 12px; font-weight: 800; letter-spacing: 1px; }.story-heading h1 { color: #ffdc59; font-size: clamp(26px,3vw,40px); line-height: 1.3; margin: 4px 70px 0 0; }.story-heading > strong { position: absolute; right: 0; bottom: 17px; font-size: 16px; font-variant-numeric: tabular-nums; }.story-heading p { font-size: 16px; margin: 10px 0 0; }
.story-sound { position: absolute; top: 26px; right: 4%; z-index: 3; min-width: 100px; min-height: 30px; padding: 5px 8px; font-size: 12px; line-height: 1.25; background: var(--paper); }
.story-sound[aria-pressed=true] { background: var(--ui-disabled-top); color: var(--ui-on-disabled); }
.story-heading h1 { margin-right: 116px; }
.story-heading > strong { bottom: 3px; }
.story-content { flex: 1; min-height: 0; display: grid; grid-template-columns: 23% minmax(0,1fr); gap: 20px; }.story-portraits { min-height: 0; display: flex; flex-wrap: wrap; align-content: center; align-items: center; justify-content: center; gap: 8px; }.story-portraits img { width: 45%; max-height: 150px; object-fit: contain; image-rendering: pixelated; filter: drop-shadow(3px 4px #0008); }.story-portraits img:only-child { width: 100%; max-height: 280px; }
.story-reading { min-height: 0; overflow-y: auto; padding: 20px 24px; color: #24180e; background: #fff1c8; border: 3px solid #bd9869; border-radius: 4px; scroll-padding: 16px; }.story-reading h2 { font-size: 22px; line-height: 1.45; margin: 0 0 14px; color: #754c27; }.story-reading p { font-size: clamp(19px,1.6vw,22px); line-height: 1.75; margin: 0 0 15px; word-break: keep-all; overflow-wrap: anywhere; }.story-reading p:last-child { margin-bottom: 0; }
.story-navigation { flex-shrink: 0; display: flex; justify-content: flex-end; gap: 12px; padding-top: 10px; border-top: 2px solid #ad8550; }.story-navigation button { min-height: 44px; min-width: 120px; font-size: 16px; }.story-navigation .primary { min-width: 160px; }.story-feedback { margin: 0; color: #ffe489; font-size: 14px; }
.story-archive { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 18px; }.story-entry { background: #f7e4b3; color: #24180e; border: 3px solid #ac8254; padding: 20px; display: flex; flex-direction: column; gap: 12px; }.story-entry > span { font-size: 12px; color: #705331; font-weight: 800; }.story-entry h2 { font-size: 22px; line-height: 1.45; margin: 0; }.story-entry p { flex: 1; font-size: 17px; line-height: 1.6; margin: 0; }.story-entry button { min-height: 44px; font-size: 16px; }
@media(max-height:650px) { .story-screen { gap: 10px; padding: 18px 3% 14px; }.story-heading { padding-bottom: 8px; }.story-heading h1 { font-size: 26px; }.story-content { gap: 10px; grid-template-columns: 19% minmax(0,1fr); }.story-reading { padding: 14px 16px; }.story-reading p { font-size: 19px; line-height: 1.65; }.story-reading h2 { font-size: 20px; margin-bottom: 10px; }.story-navigation { gap: 8px; padding-top: 8px; }.story-navigation button { min-width: 95px; padding: 8px; }.story-navigation .primary { min-width: 135px; }.story-entry { padding: 12px; gap: 8px; }.story-entry h2 { font-size: 20px; }.story-entry p { font-size: 16px; } }
@media(max-height:650px) { .story-sound { top: 18px; right: 3%; } }
</style>
