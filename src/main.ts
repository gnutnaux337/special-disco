import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

import './assets/main.css'
import App from './App.vue'
import router from './router'
import { RateLimitError } from './lib/github'

const app = createApp(App)

// Retrying a rate-limited request only burns more of the quota (and makes the
// visitor wait longer), so surface it immediately instead.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !(error instanceof RateLimitError) && failureCount < 3,
    },
  },
})

app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin, { queryClient })

app.mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}
