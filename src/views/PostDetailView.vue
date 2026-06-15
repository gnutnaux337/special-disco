<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { getPost, updatePost, deletePost } from '@/lib/github'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const postPath = decodeURIComponent(route.params.path as string)

const editMode = ref(false)
const editedContent = ref('')

const { data: post, isLoading, error } = useQuery({
  queryKey: ['post', postPath],
  queryFn: () => getPost(postPath),
  enabled: !!auth.accessToken,
  staleTime: 30_000,
})

const updateMutation = useMutation({
  mutationFn: (content: string) =>
    updatePost(postPath, post.value!.sha, content, `Update ${post.value!.name}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['post', postPath] })
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})

const deleteMutation = useMutation({
  mutationFn: () =>
    deletePost(postPath, post.value!.sha, `Delete ${post.value!.name}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
    router.push('/posts')
  },
})

function toggleEdit() {
  editMode.value = !editMode.value
  if (editMode.value) {
    editedContent.value = post.value?.content ?? ''
  }
}

async function save() {
  try {
    await updateMutation.mutateAsync(editedContent.value)
    editMode.value = false
  } catch {}
}

async function handleDelete() {
  if (!confirm('Delete this post?')) return
  await deleteMutation.mutateAsync()
}

const saveDisabled = computed(() => updateMutation.isPending.value)
</script>

<template>
  <div>
    <button class="mb-4 underline cursor-pointer" @click="router.push('/posts')">← Back to Posts</button>

    <div v-if="!auth.accessToken" class="py-8 text-gray-500">
      <p>Sign in with GitHub to view posts.</p>
    </div>

    <div v-else-if="isLoading">Loading...</div>
    <div v-else-if="error" class="text-red-600">{{ (error as Error).message }}</div>

    <div v-else-if="post">
      <div class="flex items-center gap-4 mb-4">
        <h1 class="text-xl font-bold m-0">{{ post.name }}</h1>
        <button @click="toggleEdit" class="underline cursor-pointer">{{ editMode ? 'Cancel' : 'Edit' }}</button>
        <button
          class="text-red-600 underline cursor-pointer"
          :disabled="deleteMutation.isPending.value"
          @click="handleDelete"
        >
          {{ deleteMutation.isPending.value ? 'Deleting...' : 'Delete' }}
        </button>
      </div>

      <div v-if="editMode">
        <textarea v-model="editedContent" rows="20" class="w-full border p-2 font-mono mb-2"></textarea>
        <button :disabled="saveDisabled" class="underline cursor-pointer">
          {{ updateMutation.isPending.value ? 'Saving...' : 'Save' }}
        </button>
      </div>

      <pre v-else class="whitespace-pre-wrap bg-gray-50 p-4 rounded font-mono">{{ post.content }}</pre>
    </div>
  </div>
</template>
