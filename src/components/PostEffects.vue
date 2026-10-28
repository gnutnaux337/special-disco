<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PostEffect } from '@/lib/postMeta'

// Decorative particle layer drawn inside the post area. Purely visual: no
// pointer events, no text selection, no effect on the markdown itself.
const props = defineProps<{ effect: PostEffect }>()

interface Particle {
  id: number
  text: string
  style: Record<string, string>
}

const HEARTS = ['❤️', '💖', '💕', '🩷', '💗']
const SPARKLES = ['✨', '⭐', '🌟', '💫']
const SNOW = ['❄️', '❅', '❆', '•']

const root = ref<HTMLElement>()
const travel = ref(0)
const particles = ref<Particle[]>([])
let observer: ResizeObserver | null = null
let seq = 0

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)]!

const animClass = computed(() => {
  if (props.effect === 'bubbles') return 'fx-bubble'
  if (props.effect === 'snow') return 'fx-snow'
  if (props.effect === 'sparkles') return 'fx-sparkle'
  return 'fx-rise'
})

// Rising emoji and bubbles share the same bottom-to-top path; delays are
// negative so the field looks already populated on the first frame instead of
// everything starting at the bottom at once.
function rise(count: number, list: string[], bubble: boolean) {
  return Array.from({ length: count }, (): Particle => {
    const style: Record<string, string> = {
      left: `${rand(1, 96)}%`,
      top: '100%',
      animationDuration: `${rand(9, 18)}s`,
      animationDelay: `${rand(-18, 0)}s`,
      '--fx-drift': `${rand(-45, 45)}px`,
    }
    if (bubble) style['--fx-size'] = `${rand(10, 38)}px`
    else style.fontSize = `${rand(14, 30)}px`
    return { id: seq++, text: bubble ? '' : pick(list), style }
  })
}

function build(): Particle[] {
  if (typeof window === 'undefined') return []
  if (props.effect === 'none') return []
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return []
  const narrow = window.innerWidth < 640

  if (props.effect === 'hearts') return rise(narrow ? 10 : 18, HEARTS, false)
  if (props.effect === 'bubbles') return rise(narrow ? 10 : 16, [], true)

  if (props.effect === 'snow') {
    return Array.from(
      { length: narrow ? 24 : 40 },
      (): Particle => ({
        id: seq++,
        text: pick(SNOW),
        style: {
          left: `${rand(1, 97)}%`,
          top: `${rand(-12, -2)}%`,
          fontSize: `${rand(9, 22)}px`,
          animationDuration: `${rand(7, 16)}s`,
          animationDelay: `${rand(-16, 0)}s`,
          '--fx-drift': `${rand(-60, 60)}px`,
        },
      }),
    )
  }

  return Array.from(
    { length: narrow ? 12 : 20 },
    (): Particle => ({
      id: seq++,
      text: pick(SPARKLES),
      style: {
        left: `${rand(2, 96)}%`,
        top: `${rand(2, 96)}%`,
        fontSize: `${rand(8, 18)}px`,
        animationDuration: `${rand(2.5, 5)}s`,
        animationDelay: `${rand(-5, 0)}s`,
      },
    }),
  )
}

function rebuild() {
  particles.value = build()
}

watch(() => props.effect, rebuild)

onMounted(() => {
  rebuild()
  if (!root.value) return
  // The travel distance is the post's own height, so effects fill tall posts
  // and short ones alike.
  observer = new ResizeObserver(([entry]) => {
    if (entry) travel.value = entry.contentRect.height
  })
  observer.observe(root.value)
  travel.value = root.value.clientHeight
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="root" class="post-effects" :style="{ '--fx-travel': `${travel}px` }" aria-hidden="true">
    <span
      v-for="particle in particles"
      :key="particle.id"
      class="post-effect"
      :class="animClass"
      :style="particle.style"
      >{{ particle.text }}</span
    >
  </div>
</template>
