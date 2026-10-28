<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Background music for one post. Browsers refuse audible autoplay without a
// user gesture, so playback follows a remembered opt-in and otherwise waits
// for the button (which is the only way it can start on a first visit).
const props = defineProps<{ src: string }>()

const PREF = 'sd-music'

const audio = ref<HTMLAudioElement>()
const playing = ref(false)

function prefOn(): boolean {
  try {
    return localStorage.getItem(PREF) === 'on'
  } catch {
    return false
  }
}

function setPref(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off')
  } catch {}
}

async function play() {
  const el = audio.value
  if (!el || !props.src) return
  try {
    await el.play()
  } catch {
    // Autoplay blocked: leave the pause state alone and let the button do it.
    playing.value = false
  }
}

function toggle() {
  const el = audio.value
  if (!el) return
  if (el.paused) {
    setPref(true)
    void play()
  } else {
    setPref(false)
    el.pause()
  }
}

watch(
  () => props.src,
  () => {
    playing.value = false
    if (prefOn()) void play()
  },
  { flush: 'post' },
)

onMounted(() => {
  // Quiet enough to sit under reading; the native volume control is hidden.
  if (audio.value) audio.value.volume = 0.35
  if (prefOn()) void play()
})

onBeforeUnmount(() => audio.value?.pause())
</script>

<template>
  <div>
    <audio
      ref="audio"
      :src="src"
      loop
      preload="metadata"
      class="hidden"
      @play="playing = true"
      @pause="playing = false"
    ></audio>
    <button
      type="button"
      class="fixed bottom-5 right-5 z-40 flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 bg-white/90 px-4 py-2 text-sm shadow-md backdrop-blur hover:bg-white"
      :aria-pressed="playing"
      :title="playing ? 'Pause background music' : 'Play background music'"
      @click="toggle"
    >
      <span aria-hidden="true">{{ playing ? '❚❚' : '♪' }}</span>
      <span>{{ playing ? 'Music on' : 'Play music' }}</span>
    </button>
  </div>
</template>
