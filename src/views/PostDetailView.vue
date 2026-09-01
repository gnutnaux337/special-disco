<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { getPost, updatePost, deletePost } from '@/lib/github'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

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
  staleTime: 30_000,
})

const updateMutation = useMutation({
  mutationFn: (content: string) =>
    updatePost(postPath, content, `Update ${post.value!.name}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['post', postPath] })
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})

const deleteMutation = useMutation({
  mutationFn: () => deletePost(postPath, `Delete ${post.value!.name}`),
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

const rendered = computed(() =>
  DOMPurify.sanitize(marked.parse(post.value?.content ?? '') as string),
)
</script>

<template>
  <div>
    <button class="mb-4 underline cursor-pointer" @click="router.push('/posts')">← Back to Posts</button>

    <div v-if="isLoading">Loading...</div>
    <div v-else-if="error" class="text-red-600">{{ (error as Error).message }}</div>

    <div v-else-if="post">
      <div class="flex items-center gap-4 mb-4">
        <h1 class="text-xl font-bold m-0">{{ post.name }}</h1>
        <button
          v-if="auth.accessToken"
          @click="toggleEdit"
          class="underline cursor-pointer"
        >
          {{ editMode ? 'Cancel' : 'Edit' }}
        </button>
        <button
          v-if="auth.accessToken"
          class="text-red-600 underline cursor-pointer"
          :disabled="deleteMutation.isPending.value"
          @click="handleDelete"
        >
          {{ deleteMutation.isPending.value ? 'Deleting...' : 'Delete' }}
        </button>
      </div>

      <div v-if="editMode">
        <MarkdownEditor v-model="editedContent" :rows="20" />
        <button
          :disabled="updateMutation.isPending.value"
          @click="save"
          class="underline cursor-pointer mt-2"
        >
          {{ updateMutation.isPending.value ? 'Saving...' : 'Save' }}
        </button>
      </div>

      <div v-else class="post-body" v-html="rendered"></div>
    </div>
  </div>
</template>