import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

const STORAGE_KEY = 'sb-auth'

interface StoredSession {
  access_token: string
  refresh_token: string
  provider_token: string | null
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(data: StoredSession | null) {
  if (data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const providerToken = ref<string | null>(null)

  const saved = loadSession()
  if (saved) {
    accessToken.value = saved.access_token
    refreshToken.value = saved.refresh_token
    providerToken.value = saved.provider_token
  }

  function setSession(session: {
    user: User | null
    access_token: string
    refresh_token: string
    provider_token?: string | null
  }) {
    user.value = session.user
    accessToken.value = session.access_token
    refreshToken.value = session.refresh_token
    providerToken.value = session.provider_token ?? null
    saveSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      provider_token: session.provider_token ?? null,
    })
  }

  function clearSession() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    providerToken.value = null
    saveSession(null)
  }

  async function signInWithGithub() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin + '/special-disco/',
        scopes: 'repo',
      },
    })
    if (error) throw error
  }

  async function restoreSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) return
    if (data.session) {
      setSession({
        user: data.session.user,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        provider_token: data.session.provider_token,
      })
      window.location.hash = ''
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearSession()
  }

  return {
    user,
    accessToken,
    refreshToken,
    providerToken,
    signInWithGithub,
    restoreSession,
    setSession,
    clearSession,
    signOut,
  }
})
