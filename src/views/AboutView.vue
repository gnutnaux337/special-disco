<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

const USERNAME = '1cedrus'

interface Repo {
  name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  fork: boolean
}

const { data: repos, isLoading, error } = useQuery({
  queryKey: ['repos', USERNAME],
  queryFn: async () => {
    const res = await fetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated&type=public`,
    )
    if (!res.ok) throw new Error(`Failed to load repos (${res.status})`)
    return res.json() as Promise<Repo[]>
  },
  staleTime: 5 * 60_000,
})

// Group by language, sorted by repo count descending.
const groups = computed(() => {
  const byLang = new Map<string, Repo[]>()
  for (const repo of repos.value ?? []) {
    const lang = repo.language ?? 'Other'
    byLang.set(lang, [...(byLang.get(lang) ?? []), repo])
  }
  return [...byLang.entries()].sort((a, b) => b[1].length - a[1].length)
})
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-1">About</h1>
    <p class="text-gray-600 mb-6">
      Public repos from
      <a :href="`https://github.com/${USERNAME}`" target="_blank" rel="noopener" class="underline"
        >github.com/{{ USERNAME }}</a
      >
    </p>

    <div v-if="isLoading">Loading repos…</div>
    <div v-else-if="error" class="text-red-600">{{ (error as Error).message }}</div>

    <div v-else class="flex flex-col gap-8">
      <section v-for="[lang, list] in groups" :key="lang">
        <h2 class="text-lg font-semibold mb-3 border-b border-gray-200 pb-1">
          {{ lang }}
          <span class="text-sm font-normal text-gray-400">({{ list.length }})</span>
        </h2>
        <ul class="list-none p-0 flex flex-col gap-2">
          <li
            v-for="repo in list"
            :key="repo.name"
            class="border border-gray-200 rounded p-3"
          >
            <a
              :href="repo.html_url"
              target="_blank"
              rel="noopener"
              class="font-semibold underline"
            >
              {{ repo.name }}
            </a>
            <span v-if="repo.stargazers_count > 0" class="ml-2 text-sm text-yellow-600"
              >★ {{ repo.stargazers_count }}</span
            >
            <p v-if="repo.description" class="text-sm text-gray-600 mt-1 m-0">
              {{ repo.description }}
            </p>
          </li>
        </ul>
      </section>
      <p v-if="groups.length === 0" class="text-gray-400">No public repos found.</p>
    </div>
  </div>
</template>