import { createServerClient } from '@supabase/ssr'
import type { H3Event } from 'h3'

/**
 * A Supabase client for one request, reading the login from the request's
 * cookies. If Supabase refreshes an expiring login, the new cookies are
 * written to the response.
 */
export function serverSupabase(event: H3Event) {
  const config = useRuntimeConfig(event)

  return createServerClient(config.public.supabaseUrl, config.public.supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(parseCookies(event)).map(([name, value]) => ({ name, value }))
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          setCookie(event, name, value, options)
        }
      }
    }
  })
}
