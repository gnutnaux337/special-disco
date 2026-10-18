<script setup lang="ts">
const enabled = defineModel<boolean>('enabled', { required: true })
const password = defineModel<string>('password', { required: true })
</script>

<template>
  <div class="flex flex-col gap-1">
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" v-model="enabled" />
      Encrypt with a password (AES-256, done in your browser)
    </label>
    <template v-if="enabled">
      <input
        v-model="password"
        type="password"
        autocomplete="off"
        placeholder="Password"
        class="w-full border border-gray-300 p-3 focus:outline-none focus:border-black"
      />
      <span class="text-sm text-gray-400">
        Text, images and videos are encrypted. The filename stays public, and a lost password
        can't be recovered.
      </span>
    </template>
  </div>
</template>
