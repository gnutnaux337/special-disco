<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'

const USERNAME = '1cedrus'

interface GitHubProfile {
  login: string
  name: string | null
  avatar_url: string
  bio: string | null
  location: string | null
  blog: string | null
  html_url: string
}

// Public repo owner profile; no auth needed.
const { data: profile } = useQuery({
  queryKey: ['profile', USERNAME],
  queryFn: async () => {
    const res = await fetch(`https://api.github.com/users/${USERNAME}`)
    if (!res.ok) throw new Error(`Failed to load profile (${res.status})`)
    return res.json() as Promise<GitHubProfile>
  },
  staleTime: 5 * 60_000,
})
</script>

<template>
  <main class="flex flex-col items-center justify-start text-center pt-8">
    <template v-if="profile">
      <img
        :src="profile.avatar_url"
        :alt="profile.name || profile.login"
        class="w-36 h-36 rounded-full border-4 border-gray-200 mb-5"
      />
      <h1 class="text-3xl font-bold m-0">{{ profile.name || profile.login }}</h1>
      <p v-if="profile.bio" class="text-gray-600 mt-2 mb-4 max-w-md">{{ profile.bio }}</p>

      <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4 text-sm">
        <span v-if="profile.location">📍 {{ profile.location }}</span>
        <a v-if="profile.blog" :href="profile.blog" target="_blank" rel="noopener" class="underline">🌐 {{ profile.blog }}</a>
        <a :href="profile.html_url" target="_blank" rel="noopener" class="underline">GitHub</a>
      </div>
    </template>

    <p v-else class="text-gray-400">Loading profile…</p>
  </main>
</template>
