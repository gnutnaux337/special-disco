<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { initOctokit } from '@/lib/github'

const auth = useAuthStore()

onMounted(async () => {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      auth.setSession({
        user: session.user,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        provider_token: session.provider_token,
      })
      if (session.provider_token) {
        initOctokit(session.provider_token)
      }
    }
  })

  await auth.restoreSession()

  if (auth.providerToken) {
    initOctokit(auth.providerToken)
  }

  if (window.location.hash.includes('access_token')) {
    window.location.hash = ''
  }
})

async function signIn() {
  try {
    await auth.signInWithGithub()
  } catch (e) {
    console.error('Sign in failed:', e)
  }
}

async function signOut() {
  await auth.signOut()
}
</script>

<template>
  <div class="max-w-2xl mx-auto p-6">
    <header class="flex justify-between items-center mb-8">
      <nav class="flex gap-6">
        <RouterLink to="/" class="underline">Home</RouterLink>
        <RouterLink to="/about" class="underline">About</RouterLink>
        <RouterLink to="/posts" class="underline">Posts</RouterLink>
      </nav>

      <div>
        <button v-if="!auth.user" @click="signIn" class="underline">Sign in with GitHub</button>
        <div v-else class="flex items-center gap-3">
          <span>{{ auth.user.email || auth.user.user_metadata?.user_name }}</span>
          <button @click="signOut" class="underline">Sign Out</button>
        </div>
      </div>
    </header>

    <RouterView />
  </div>
</template>
