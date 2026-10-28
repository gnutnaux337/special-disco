<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { getPost, updatePost, deletePost, fetchBytes } from '@/lib/github'
import { isEncrypted, encryptBytes, decryptBytes } from '@/lib/crypto'
import { encryptEmbeddedMedia } from '@/lib/postMedia'
import { renderMarkdown } from '@/lib/markdown'
import { parseFrontmatter } from '@/lib/postMeta'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import PostEffects from '@/components/PostEffects.vue'
import PostMusic from '@/components/PostMusic.vue'
import EncryptionFields from '@/components/EncryptionFields.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import RateLimitNotice from '@/components/RateLimitNotice.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const postPath = decodeURIComponent(route.params.path as string)

const editMode = ref(false)
const editedContent = ref('')
const editEncrypt = ref(false)
const editPassword = ref('')
const saveProgress = ref<{ label: string; value: number } | null>(null)

const {
  data: post,
  isLoading,
  error,
  refetch,
} = useQuery({
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
  encrypted.value ? plaintext.value : post.value ? new TextDecoder().decode(post.value.bytes) : '',
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
    /\.enc\b/.test(editedContent.value) &&
    !confirm("Embedded media is still encrypted and won't display in a public post. Continue?")
  ) {
    return
  }
  try {
    let data: string | Uint8Array = editedContent.value
    if (editEncrypt.value) {
      editedContent.value = await encryptEmbeddedMedia(
        editedContent.value,
        editPassword.value,
        (label, value) => {
          saveProgress.value = { label, value }
        },
      )
      data = await encryptBytes(
        new TextEncoder().encode(editedContent.value),
        editPassword.value,
        (value) => {
          saveProgress.value = { label: 'Encrypting…', value }
        },
      )
    }
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

// Frontmatter carries per-post presentation (effect, background music) and is
// stripped before markdown rendering so it never shows up as text.
const parsed = computed(() => parseFrontmatter(content.value ?? ''))
const rendered = computed(() => renderMarkdown(parsed.value.body))
const effect = computed(() => parsed.value.meta.effect ?? 'none')

// Only http(s) tracks; the value comes from the post file, so don't hand the
// audio element javascript: or local-file URLs.
const musicUrl = computed(() => {
  const url = parsed.value.meta.music
  if (!url) return ''
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? parsedUrl.href : ''
  } catch {
    return ''
  }
})
const musicEncrypted = computed(() => /\.enc(?:[?#].*)?$/i.test(musicUrl.value))
const musicBlobUrl = ref('')

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
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  opus: 'audio/ogg',
  weba: 'audio/webm',
}
const blobUrls: string[] = []
let run = 0

async function decryptMedia() {
  const mine = ++run
  musicBlobUrl.value = ''
  const jobs = [...(body.value?.querySelectorAll<HTMLElement>('[data-enc-src]') ?? [])].map(
    (el) => ({
      url: el.dataset.encSrc!,
      apply: (blobUrl: string) => el.setAttribute('src', blobUrl),
    }),
  )
  // Background music lives in frontmatter, not in the rendered body, so it is
  // decrypted here and handed to the player as a blob URL.
  if (musicUrl.value && musicEncrypted.value && password.value) {
    jobs.push({ url: musicUrl.value, apply: (blobUrl) => (musicBlobUrl.value = blobUrl) })
  }
  if (!jobs.length || !password.value) {
    mediaProgress.value = null
    return
  }

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!
      const url = job.url
      const label = `Decrypting media ${i + 1}/${jobs.length}`
      mediaProgress.value = { label, value: i / jobs.length }
      // First half of each item's share is the download, second half the decrypt.
      const enc = await fetchBytes(url, (f) => {
        mediaProgress.value = { label, value: (i + f * 0.5) / jobs.length }
      })
      const plain = await decryptBytes(enc, password.value, (f) => {
        mediaProgress.value = { label, value: (i + 0.5 + f * 0.5) / jobs.length }
      })
      if (mine !== run) return
      const ext = /\.(\w+)\.enc/i.exec(url)?.[1]?.toLowerCase() ?? ''
      const blobUrl = URL.createObjectURL(new Blob([plain as BlobPart], { type: MIME[ext] }))
      blobUrls.push(blobUrl)
      job.apply(blobUrl)
    }
  } catch (e) {
    if (mine === run) alert(`Could not decrypt media: ${(e as Error).message}`)
  } finally {
    if (mine === run) mediaProgress.value = null
  }
}

watch([rendered, musicUrl, body], decryptMedia, { flush: 'post' })
onBeforeUnmount(() => {
  run++
  blobUrls.forEach(URL.revokeObjectURL)
})
</script>

<template>
  <div>
    <button class="mb-4 underline cursor-pointer" @click="router.push('/posts')">
      ← Back to Posts
    </button>

    <div v-if="isLoading">Loading...</div>
    <RateLimitNotice v-else-if="error" :error="error" @retry="refetch()" />

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
        <button
          type="submit"
          class="self-start underline cursor-pointer"
          :disabled="unlockProgress !== null"
        >
          Unlock
        </button>
      </form>

      <div v-else-if="editMode" class="flex flex-col gap-2">
        <EncryptionFields v-model:enabled="editEncrypt" v-model:password="editPassword" />
        <MarkdownEditor
          v-model="editedContent"
          :rows="20"
          :encrypt="editEncrypt"
          :password="editPassword"
        />
        <ProgressBar v-if="saveProgress" :label="saveProgress.label" :value="saveProgress.value" />
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
        <div class="relative">
          <PostEffects v-if="effect !== 'none'" :effect="effect" />
          <div class="relative z-10">
            <ProgressBar
              v-if="mediaProgress"
              class="mb-4"
              :label="mediaProgress.label"
              :value="mediaProgress.value"
            />
            <div ref="body" class="post-body" v-html="rendered"></div>
          </div>
        </div>

        <PostMusic
          v-if="musicUrl && (musicEncrypted ? musicBlobUrl : true)"
          :src="musicEncrypted ? musicBlobUrl : musicUrl"
        />
      </div>
    </div>
  </div>
</template>
