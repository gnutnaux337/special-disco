<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { listPosts, createPost, deletePost } from '@/lib/github'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import EncryptionFields from '@/components/EncryptionFields.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import { encryptBytes } from '@/lib/crypto'

const auth = useAuthStore()
const router = useRouter()
const queryClient = useQueryClient()

const showCreateForm = ref(false)
const newFilename = ref('')
const newContent = ref('')
const encrypt = ref(false)
const newPassword = ref('')
const encryptProgress = ref<number | null>(null)

const { data: posts, isLoading, error } = useQuery({
  queryKey: ['posts', computed(() => !!auth.providerToken)],
  queryFn: listPosts,
  staleTime: 300_000,
})

const createMutation = useMutation({
  mutationFn: ({ filename, content }: { filename: string; content: string | Uint8Array }) =>
    createPost(filename, content, `Create ${filename}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})

const deleteMutation = useMutation({
  mutationFn: ({ path, name }: { path: string; name: string }) =>
    deletePost(path, `Delete ${name}`),
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
  if (encrypt.value && !newPassword.value) {
    alert('Enter a password, or turn encryption off.')
    return
  }
  try {
    const content = encrypt.value
      ? await encryptBytes(new TextEncoder().encode(newContent.value), newPassword.value, (f) => {
          encryptProgress.value = f
        })
      : newContent.value
    await createMutation.mutateAsync({ filename, content })
    showCreateForm.value = false
    newFilename.value = ''
    newContent.value = ''
    encrypt.value = false
    newPassword.value = ''
  } catch {
  } finally {
    encryptProgress.value = null
  }
}

async function handleDelete(path: string, name: string) {
  if (!confirm(`Delete "${name}"?`)) return
  await deleteMutation.mutateAsync({ path, name })
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-bold m-0">Posts</h1>
      <button
        v-if="auth.canWrite"
        @click="showCreateForm = !showCreateForm"
        class="underline cursor-pointer"
      >
        {{ showCreateForm ? 'Cancel' : 'New Post' }}
      </button>
    </div>

    <div v-if="showCreateForm" class="flex flex-col gap-2 mb-4 w-full">
      <input v-model="newFilename" placeholder="Filename (e.g. my-post.md)" class="w-full border border-gray-300 p-3 font-mono focus:outline-none focus:border-black" />
      <EncryptionFields v-model:enabled="encrypt" v-model:password="newPassword" />
      <MarkdownEditor v-model="newContent" :rows="8" :encrypt="encrypt" :password="newPassword" />
      <ProgressBar v-if="encryptProgress !== null" label="Encrypting…" :value="encryptProgress" />
      <ProgressBar v-else-if="createMutation.isPending.value" label="Saving…" />
      <button
        :disabled="createMutation.isPending.value"
        @click="handleCreate"
        class="self-start underline cursor-pointer"
      >
        {{ createMutation.isPending.value ? 'Creating...' : 'Create' }}
      </button>
    </div>

    <div v-if="isLoading">Loading...</div>
    <div v-if="error" class="text-red-600">{{ (error as Error).message }}</div>

    <ul v-if="!isLoading" class="list-none p-0">
      <li
        v-for="post in posts ?? []"
        :key="post.path"
        class="flex items-center justify-between py-2 border-b border-gray-200"
      >
        <span class="underline cursor-pointer flex-1 hover:bg-gray-100" @click="viewPost(post.path)">{{ post.name }}</span>
        <span v-if="post.createdAt" class="text-gray-400 text-sm mx-4">{{
          new Date(post.createdAt).toLocaleDateString()
        }}</span>
        <button
          v-if="auth.canWrite"
          class="text-red-600 underline cursor-pointer"
          :disabled="deleteMutation.isPending.value"
          @click="handleDelete(post.path, post.name)"
        >
          Delete
        </button>
      </li>
      <li v-if="!isLoading && (posts ?? []).length === 0" class="py-2">
        <em>No posts found in the posts/ folder.</em>
      </li>
    </ul>
  </div>
</template>