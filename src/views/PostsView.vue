<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { listPosts, createPost, deletePost } from '@/lib/github'

const auth = useAuthStore()
const router = useRouter()
const queryClient = useQueryClient()

const showCreateForm = ref(false)
const newFilename = ref('')
const newContent = ref('')

const { data: posts, isLoading, error } = useQuery({
  queryKey: ['posts'],
  queryFn: listPosts,
  enabled: !!auth.accessToken,
  staleTime: 30_000,
})

const createMutation = useMutation({
  mutationFn: ({ filename, content }: { filename: string; content: string }) =>
    createPost(filename, content, `Create ${filename}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})

const deleteMutation = useMutation({
  mutationFn: ({ path, sha, name }: { path: string; sha: string; name: string }) =>
    deletePost(path, sha, `Delete ${name}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})

function viewPost(path: string) {
  router.push(`/posts/${encodeURIComponent(path)}`)
}

async function handleCreate() {
  if (!newFilename.value || !newContent.value) return
  const filename = newFilename.value.endsWith('.md')
    ? newFilename.value
    : `${newFilename.value}.md`
  try {
    await createMutation.mutateAsync({ filename, content: newContent.value })
    showCreateForm.value = false
    newFilename.value = ''
    newContent.value = ''
  } catch {}
}

async function handleDelete(path: string, sha: string, name: string) {
  if (!confirm(`Delete "${name}"?`)) return
  await deleteMutation.mutateAsync({ path, sha, name })
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-bold m-0">Posts</h1>
      <button
        v-if="auth.accessToken"
        @click="showCreateForm = !showCreateForm"
        class="underline cursor-pointer"
      >
        {{ showCreateForm ? 'Cancel' : 'New Post' }}
      </button>
    </div>

    <div v-if="!auth.accessToken" class="py-8 text-gray-500">
      <p>Sign in with GitHub to view and manage posts.</p>
    </div>

    <template v-else>
      <div v-if="showCreateForm" class="flex flex-col gap-2 mb-4 max-w-lg">
        <input v-model="newFilename" placeholder="Filename (e.g. my-post.md)" class="border p-2 font-mono" />
        <textarea v-model="newContent" placeholder="Post content..." rows="10" class="border p-2 font-mono"></textarea>
        <button
          :disabled="createMutation.isPending.value"
          @click="handleCreate"
           class="underline cursor-pointer"
         >
           {{ createMutation.isPending.value ? 'Creating...' : 'Create' }}
        </button>
      </div>

      <div v-if="isLoading">Loading...</div>
      <div v-if="error" class="text-red-600">{{ (error as Error).message }}</div>

      <ul v-if="!isLoading" class="list-none p-0">
        <li
          v-for="post in posts ?? []"
          :key="post.sha"
          class="flex items-center justify-between py-2 border-b border-gray-200"
        >
          <span class="underline cursor-pointer flex-1 hover:bg-gray-100" @click="viewPost(post.path)">{{ post.name }}</span>
          <button
            class="text-red-600 underline cursor-pointer"
            :disabled="deleteMutation.isPending.value"
            @click="handleDelete(post.path, post.sha, post.name)"
          >
            Delete
          </button>
        </li>
        <li v-if="!isLoading && (posts ?? []).length === 0" class="py-2">
          <em>No posts found in the posts/ folder.</em>
        </li>
      </ul>
    </template>
  </div>
</template>
