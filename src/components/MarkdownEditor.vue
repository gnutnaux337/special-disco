<script setup lang="ts">
import { ref } from 'vue'
import { uploadImage } from '@/lib/github'

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
  if (!file || !file.type.startsWith('image/')) return

  uploading.value = true
  try {
    const name = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const url = await uploadImage(name, file)
    const alt = file.name.replace(/\.[^.]+$/, '') || 'image'
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
    <div class="flex items-center justify-between text-sm">
      <button
        type="button"
        class="underline cursor-pointer"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        {{ uploading ? 'Uploading…' : 'Upload image' }}
      </button>
      <span class="text-gray-400">Images save to the repo and render centered.</span>
    </div>
    <textarea
      :value="modelValue"
      :rows="rows ?? 10"
      class="w-full border p-2 font-mono"
      @input="onInput"
    ></textarea>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFile"
    />
  </div>
</template>