<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RateLimitError } from '@/lib/github'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ error: unknown }>()
const emit = defineEmits<{ retry: [] }>()

const auth = useAuthStore()

const rateLimited = computed(() => props.error instanceof RateLimitError)
const message = computed(() => {
  if (props.error instanceof Error) return props.error.message
  return props.error ? String(props.error) : ''
})
const resetAt = computed(() => (props.error instanceof RateLimitError ? props.error.resetAt : null))

// Tick once a second so the "come back in…" countdown stays honest.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (!resetAt.value) return
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const wait = computed(() => {
  if (!resetAt.value) return ''
  const ms = resetAt.value.getTime() - now.value
  if (ms <= 0) return ''
  const total = Math.ceil(ms / 1000)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`
})

const signingIn = ref(false)
async function signIn() {
  signingIn.value = true
  try {
    await auth.signInWithGithub()
  } catch (e) {
    console.error('Sign in failed:', e)
    signingIn.value = false
  }
}
</script>

<template>
  <section v-if="rateLimited" class="border border-gray-300 bg-gray-50 p-4 my-4">
    <h2 class="text-lg font-bold m-0 mb-2">Ahhh, too many requests! 🙈</h2>
    <p class="m-0 mb-2">
      GitHub says we've been knocking on its door way too fast and put my little website in
      time-out. Even robots need a nap.
    </p>
    <p class="m-0 mb-3 text-sm text-gray-600">
      <template v-if="wait">
        Come back in about <strong>{{ wait }}</strong> and everything should load again.
      </template>
      <template v-else> Give it a few minutes and everything should load again. </template>
      <template v-if="!auth.user">
        Or sign in with GitHub to skip the queue — signed-in readers get a much bigger allowance.
      </template>
    </p>
    <div class="flex flex-wrap items-center gap-4">
      <button
        v-if="!auth.user"
        type="button"
        class="underline cursor-pointer disabled:opacity-50"
        :disabled="signingIn"
        @click="signIn"
      >
        {{ signingIn ? 'Redirecting…' : 'Sign in with GitHub' }}
      </button>
      <button type="button" class="underline cursor-pointer" @click="emit('retry')">
        Try again
      </button>
    </div>
  </section>

  <section v-else class="border border-red-200 p-4 my-4 text-red-700">
    <h2 class="text-lg font-bold m-0 mb-2">Something went wrong</h2>
    <p class="m-0 mb-3 text-sm">{{ message || 'Please try again in a moment.' }}</p>
    <button type="button" class="underline cursor-pointer" @click="emit('retry')">Try again</button>
  </section>
</template>
