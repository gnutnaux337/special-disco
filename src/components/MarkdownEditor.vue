<script setup lang="ts">
import { ref } from 'vue'
import { uploadMedia } from '@/lib/github'

const props = defineProps<{ modelValue: string; rows?: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !/^(image|video)\//.test(file.type)) return

  uploading.value = true
  try {
    const name = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const url = await uploadMedia(name, file)
    const alt = file.name.replace(/\.[^.]+$/, '') || 'media'
    emit('update:modelValue', `${props.modelValue}\n![${alt}](${url})\n`)
  } catch (e) {
    alert(`Upload failed: ${(e as Error).message}`)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between gap-4 text-sm">
      <button
        type="button"
        class="underline cursor-pointer whitespace-nowrap"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        {{ uploading ? 'Uploading…' : 'Upload image/video' }}
      </button>
      <span class="text-gray-400 text-right">Media saves to the repo (max 100MB). Videos render with controls.</span>
    </div>
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