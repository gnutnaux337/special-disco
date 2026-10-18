<script setup lang="ts">
import { ref } from 'vue'
import { uploadMedia } from '@/lib/github'
import { encryptBytes } from '@/lib/crypto'
import ProgressBar from '@/components/ProgressBar.vue'

const props = defineProps<{ modelValue: string; rows?: number; encrypt?: boolean; password?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const fileInput = ref<HTMLInputElement>()
const progress = ref<{ label: string; value: number } | null>(null)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !/^(image|video)\//.test(file.type)) return
  if (props.encrypt && !props.password) {
    alert('Enter a password first, or turn encryption off.')
    return
  }

  progress.value = { label: 'Preparing…', value: 0 }
  try {
    let name = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    let blob: Blob = file
    if (props.encrypt) {
      const data = await encryptBytes(new Uint8Array(await file.arrayBuffer()), props.password!, (f) => {
        progress.value = { label: 'Encrypting…', value: f }
      })
      blob = new Blob([data as BlobPart])
      name += '.enc'
    }
    progress.value = { label: 'Uploading…', value: 0 }
    const url = await uploadMedia(name, blob, (f) => {
      progress.value = { label: 'Uploading…', value: f }
    })
    const alt = file.name.replace(/\.[^.]+$/, '') || 'media'
    emit('update:modelValue', `${props.modelValue}\n![${alt}](${url})\n`)
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
        Upload image/video
      </button>
      <span class="text-gray-400 text-right">Media saves to the repo (max 100MB). Videos render with controls.</span>
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
      accept="image/*,video/*"
      class="hidden"
      @change="onFile"
    />
  </div>
</template>