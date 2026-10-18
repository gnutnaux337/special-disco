<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { getPost, updatePost, deletePost, fetchBytes } from '@/lib/github'
import { isEncrypted, encryptBytes, decryptBytes } from '@/lib/crypto'
import { renderMarkdown } from '@/lib/markdown'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import EncryptionFields from '@/components/EncryptionFields.vue'
import ProgressBar from '@/components/ProgressBar.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const postPath = decodeURIComponent(route.params.path as string)

const editMode = ref(false)
const editedContent = ref('')
const editEncrypt = ref(false)
const editPassword = ref('')
const saveProgress = ref<number | null>(null)

const { data: post, isLoading, error } = useQuery({
  queryKey: ['post', postPath],
  queryFn: () => getPost(postPath),
  staleTime: 30_000,
})

// An encrypted post is recognised by its magic header, then stays locked until
// the right password decrypts it. The password is only ever kept in memory.
const encrypted = computed(() => !!post.value && isEncrypted(post.value.bytes))
const plaintext = ref<string | null>(null)
const password = ref('')
const locked = computed(() => encrypted.value && plaintext.value === null)
const content = computed(() =>
  encrypted.value
    ? plaintext.value
    : post.value
      ? new TextDecoder().decode(post.value.bytes)
      : '',
)

const unlockInput = ref('')
const unlockError = ref('')
const unlockProgress = ref<number | null>(null)

async function unlock() {
  if (!post.value || !unlockInput.value) return
  unlockError.value = ''
  unlockProgress.value = 0
  try {
    const data = await decryptBytes(post.value.bytes, unlockInput.value, (f) => {
      unlockProgress.value = f
    })
    plaintext.value = new TextDecoder().decode(data)
    password.value = unlockInput.value
    unlockInput.value = ''
  } catch (e) {
    unlockError.value = (e as Error).message
  } finally {
    unlockProgress.value = null
  }
}

const updateMutation = useMutation({
  mutationFn: (data: string | Uint8Array) =>
    updatePost(postPath, data, `Update ${post.value!.name}`),
  onSuccess: () => {
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
    editedContent.value = content.value ?? ''
    editEncrypt.value = encrypted.value
    editPassword.value = password.value
  }
}

async function save() {
  if (editEncrypt.value && !editPassword.value) {
    alert('Enter a password, or turn encryption off.')
    return
  }
  if (
    !editEncrypt.value &&
    /\.enc\)/.test(editedContent.value) &&
    !confirm("Embedded media is still encrypted and won't display in a public post. Continue?")
  ) {
    return
  }
  try {
    const data = editEncrypt.value
      ? await encryptBytes(
          new TextEncoder().encode(editedContent.value),
          editPassword.value,
          (f) => {
            saveProgress.value = f
          },
        )
      : editedContent.value
    await updateMutation.mutateAsync(data)
    plaintext.value = editedContent.value
    password.value = editEncrypt.value ? editPassword.value : ''
    queryClient.setQueryData(['post', postPath], {
      ...post.value!,
      bytes: typeof data === 'string' ? new TextEncoder().encode(data) : data,
    })
    editMode.value = false
  } catch {
  } finally {
    saveProgress.value = null
  }
}

async function handleDelete() {
  if (!confirm('Delete this post?')) return
  await deleteMutation.mutateAsync()
}

const rendered = computed(() => (content.value === null ? '' : renderMarkdown(content.value)))

// Encrypted media is downloaded, decrypted and shown through blob: URLs.
const body = ref<HTMLElement>()
const mediaProgress = ref<{ label: string; value: number } | null>(null)
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
}
const blobUrls: string[] = []
let run = 0

async function decryptMedia() {
  const mine = ++run
  const els = [...(body.value?.querySelectorAll<HTMLElement>('[data-enc-src]') ?? [])]
  if (!els.length || !password.value) {
    mediaProgress.value = null
    return
  }

  try {
    for (let i = 0; i < els.length; i++) {
      const el = els[i]!
      const url = el.dataset.encSrc!
      const label = `Decrypting media ${i + 1}/${els.length}`
      mediaProgress.value = { label, value: i / els.length }
      // First half of each item's share is the download, second half the decrypt.
      const enc = await fetchBytes(url, (f) => {
        mediaProgress.value = { label, value: (i + f * 0.5) / els.length }
      })
      const plain = await decryptBytes(enc, password.value, (f) => {
        mediaProgress.value = { label, value: (i + 0.5 + f * 0.5) / els.length }
      })
      if (mine !== run) return
      const ext = /\.(\w+)\.enc/i.exec(url)?.[1]?.toLowerCase() ?? ''
      const blobUrl = URL.createObjectURL(new Blob([plain as BlobPart], { type: MIME[ext] }))
      blobUrls.push(blobUrl)
      el.setAttribute('src', blobUrl)
    }
  } catch (e) {
    if (mine === run) alert(`Could not decrypt media: ${(e as Error).message}`)
  } finally {
    if (mine === run) mediaProgress.value = null
  }
}

watch([rendered, body], decryptMedia, { flush: 'post' })
onBeforeUnmount(() => {
  run++
  blobUrls.forEach(URL.revokeObjectURL)
})
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
          v-if="auth.canWrite && !locked"
          @click="toggleEdit"
          class="underline cursor-pointer"
        >
          {{ editMode ? 'Cancel' : 'Edit' }}
        </button>
        <button
          v-if="auth.canWrite"
          class="text-red-600 underline cursor-pointer"
          :disabled="deleteMutation.isPending.value"
          @click="handleDelete"
        >
          {{ deleteMutation.isPending.value ? 'Deleting...' : 'Delete' }}
        </button>
      </div>

      <form v-if="locked" class="flex flex-col gap-2" @submit.prevent="unlock">
        <p class="m-0">This post is encrypted. Enter the password to read it.</p>
        <input
          v-model="unlockInput"
          type="password"
          autocomplete="off"
          placeholder="Password"
          class="w-full border border-gray-300 p-3 focus:outline-none focus:border-black"
        />
        <ProgressBar v-if="unlockProgress !== null" label="Decrypting…" :value="unlockProgress" />
        <div v-if="unlockError" class="text-red-600">{{ unlockError }}</div>
        <button type="submit" class="self-start underline cursor-pointer" :disabled="unlockProgress !== null">
          Unlock
        </button>
      </form>

      <div v-else-if="editMode" class="flex flex-col gap-2">
        <EncryptionFields v-model:enabled="editEncrypt" v-model:password="editPassword" />
        <MarkdownEditor v-model="editedContent" :rows="20" :encrypt="editEncrypt" :password="editPassword" />
        <ProgressBar v-if="saveProgress !== null" label="Encrypting…" :value="saveProgress" />
        <ProgressBar v-else-if="updateMutation.isPending.value" label="Saving…" />
        <button
          :disabled="updateMutation.isPending.value"
          @click="save"
          class="self-start underline cursor-pointer"
        >
          {{ updateMutation.isPending.value ? 'Saving...' : 'Save' }}
        </button>
      </div>

      <div v-else>
        <ProgressBar v-if="mediaProgress" class="mb-4" :label="mediaProgress.label" :value="mediaProgress.value" />
        <div ref="body" class="post-body" v-html="rendered"></div>
      </div>
    </div>
  </div>
</template>