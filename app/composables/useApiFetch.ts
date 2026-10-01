import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'

/**
 * Use this instead of raw `$fetch` / `useFetch` for any call to our own
 * `/api/...` routes that requires the caller to be identified. The login
 * travels in the Supabase cookie, which the browser sends with every request
 * and `server/middleware/auth.ts` validates on the way in.
 *
 * Public, unauthenticated routes can keep using plain `$fetch`.
 */
export function useApiFetch<T>(
  url: NitroFetchRequest,
  options: NitroFetchOptions<NitroFetchRequest> = {}
) {
  const authStore = useAuthStore()

  return $fetch<T>(url, options).catch(async (err) => {
    // A login that has expired (or was cancelled) is refused with 401. Rather
    // than leave a half-loaded page or an error screen, sign out and send the
    // browser to the login page. It is a full page load on purpose: a router
    // navigation can wait forever on the page that is still loading. The
    // never-settling promise stops that page carrying on (and crashing) until
    // the browser has left.
    if (import.meta.client && (err as { statusCode?: number })?.statusCode === 401 && authStore.user) {
      await authStore.signOut().catch(() => {})
      window.location.assign('/login')
      return new Promise<never>(() => {})
    }
    throw err
  })
}
