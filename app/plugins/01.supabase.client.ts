import { createBrowserClient } from '@supabase/ssr'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  // The browser client keeps the login in cookies (not browser storage), so
  // the server receives it automatically with every request.
  const supabase = createBrowserClient(
    config.public.supabaseUrl,
    config.public.supabaseAnonKey
  )

  return {
    provide: { supabase }
  }
})
