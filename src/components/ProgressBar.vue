<script setup lang="ts">
// value: 0..1, or omitted for an indeterminate bar.
defineProps<{ label: string; value?: number }>()
</script>

<template>
  <div class="text-sm">
    <div class="flex justify-between mb-1">
      <span>{{ label }}</span>
      <span v-if="value !== undefined" class="text-gray-400">{{ Math.round(value * 100) }}%</span>
    </div>
    <div class="h-1 bg-gray-200">
      <div
        class="h-full bg-black"
        :class="{ 'animate-pulse': value === undefined }"
        :style="{ width: value === undefined ? '100%' : `${Math.round(value * 100)}%` }"
      ></div>
    </div>
  </div>
</template>
