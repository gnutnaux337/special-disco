<script setup lang="ts">
import { computed, ref } from 'vue'
import { uploadMedia } from '@/lib/github'
import { encryptBytes } from '@/lib/crypto'
import { POST_EFFECTS, parseFrontmatter, setFrontmatter, type PostEffect } from '@/lib/postMeta'
import ProgressBar from '@/components/ProgressBar.vue'

const props = defineProps<{
  modelValue: string
  rows?: number
  encrypt?: boolean
  password?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const fileInput = ref<HTMLInputElement>()
const musicInput = ref<HTMLInputElement>()
const progress = ref<{ label: string; value: number } | null>(null)

const meta = computed(() => parseFrontmatter(props.modelValue).meta)
const effect = computed(() => meta.value.effect ?? 'none')
const musicName = computed(() => {
  const url = meta.value.music
  if (!url) return ''
  try {
    return decodeURIComponent(url.split('/').pop() ?? '')
  } catch {
    return url.split('/').pop() ?? ''
  }
})

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function onEffect(event: Event) {
  const value = (event.target as HTMLSelectElement).value as PostEffect
  emit(
    'update:modelValue',
    setFrontmatter(props.modelValue, { effect: value === 'none' ? undefined : value }),
  )
}

function removeMusic() {
  emit('update:modelValue', setFrontmatter(props.modelValue, { music: undefined }))
}

// Upload one media file into posts/images/, encrypting first when the post is
// encrypted, and return the URL to embed.
async function upload(file: File): Promise<string> {
  let name = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
  let blob: Blob = file
  if (props.encrypt) {
    const data = await encryptBytes(
      new Uint8Array(await file.arrayBuffer()),
      props.password!,
      (f) => {
        progress.value = { label: 'Encrypting…', value: f }
      },
    )
    blob = new Blob([data as BlobPart])
    name += '.enc'
  }
  progress.value = { label: 'Uploading…', value: 0 }
  return uploadMedia(name, blob, (f) => {
    progress.value = { label: 'Uploading…', value: f }
  })
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !/^(image|video|audio)\//.test(file.type)) return
  if (props.encrypt && !props.password) {
    alert('Enter a password first, or turn encryption off.')
    return
  }

  progress.value = { label: 'Preparing…', value: 0 }
  try {
    const url = await upload(file)
    const alt = file.name.replace(/\.[^.]+$/, '') || 'media'
    emit('update:modelValue', `${props.modelValue}\n![${alt}](${url})\n`)
  } catch (e) {
    alert(`Upload failed: ${(e as Error).message}`)
  } finally {
    progress.value = null
  }
}

async function onMusicFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !file.type.startsWith('audio/')) return
  if (props.encrypt && !props.password) {
    alert('Enter a password first, or turn encryption off.')
    return
  }

  progress.value = { label: 'Preparing…', value: 0 }
  try {
    const url = await upload(file)
    emit('update:modelValue', setFrontmatter(props.modelValue, { music: url }))
  } catch (e) {
    alert(`Upload failed: ${(e as Error).message}`)
  } finally {
    progress.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between gap-4 text-sm">
      <button
        type="button"
        class="underline cursor-pointer whitespace-nowrap"
        :disabled="!!progress"
        @click="fileInput?.click()"
      >
        Upload image / video / audio
      </button>
      <span class="text-gray-400 text-right"
        >Media saves to the repo (max 100MB). Audio files (mp3, m4a, wav…) get a player.</span
      >
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <label class="flex items-center gap-2">
        <span>Effect</span>
        <select
          :value="effect"
          class="cursor-pointer border border-gray-300 bg-white px-1 py-0.5 focus:outline-none focus:border-black"
          @change="onEffect"
        >
          <option v-for="option in POST_EFFECTS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <button
        type="button"
        class="underline cursor-pointer"
        :disabled="!!progress"
        @click="musicInput?.click()"
      >
        {{ meta.music ? 'Replace background music' : 'Add background music' }}
      </button>
      <button
        v-if="meta.music"
        type="button"
        class="underline cursor-pointer text-red-600"
        :disabled="!!progress"
        @click="removeMusic"
      >
        Remove
      </button>
      <span v-if="musicName" class="max-w-64 truncate text-gray-500">{{ musicName }}</span>
    </div>

    <ProgressBar v-if="progress" :label="progress.label" :value="progress.value" />
    <textarea
      :value="modelValue"
      :rows="rows ?? 10"
      class="w-full border border-gray-300 p-3 font-mono leading-relaxed focus:outline-none focus:border-black"
      @input="onInput"
    ></textarea>
    <input
      ref="fileInput"
      type="file"
      accept="image/*,video/*,audio/*"
      class="hidden"
      @change="onFile"
    />
    <input ref="musicInput" type="file" accept="audio/*" class="hidden" @change="onMusicFile" />
  </div>
</template>
