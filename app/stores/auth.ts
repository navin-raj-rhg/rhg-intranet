import type { Session, User } from '@supabase/supabase-js'

export interface Profile {
  id: string
  email: string
  fullName: string | null
  isOwner: boolean
  /** Set when the owner has deactivated this person; they can no longer use the app. */
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(true)

  let initialized = false

  /**
   * Reads the current session (if any), fetches the matching profile, and
   * subscribes to future auth changes (login/logout/token refresh in other
   * tabs). Safe to call multiple times - only runs once.
   */
  async function init() {
    if (initialized) return
    initialized = true

    const supabase = useSupabase()

    const { data } = await supabase.auth.getSession()
    session.value = data.session
    user.value = data.session?.user ?? null

    if (user.value) {
      await fetchProfile()
    }
    loading.value = false

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
      user.value = newSession?.user ?? null
      if (user.value) {
        fetchProfile()
      } else {
        profile.value = null
      }
    })
  }

  async function fetchProfile() {
    try {
      profile.value = await useApiFetch<Profile>('/api/auth/me')
    } catch {
      profile.value = null
    }
  }

  async function signIn(email: string, password: string) {
    const supabase = useSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string, fullName: string) {
    const supabase = useSupabase()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) throw error
  }

  /** Emails a "forgot password" link that lands on /reset-password. */
  async function sendPasswordReset(email: string) {
    const supabase = useSupabase()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (error) throw error
  }

  /** Sets a new password for the signed-in person. */
  async function changePassword(password: string) {
    const supabase = useSupabase()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  async function signOut() {
    const supabase = useSupabase()
    await supabase.auth.signOut()
  }

  return {
    user,
    session,
    profile,
    loading,
    init,
    fetchProfile,
    signIn,
    signUp,
    sendPasswordReset,
    changePassword,
    signOut
  }
})
