import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'

/**
 * Use this instead of raw `$fetch` / `useFetch` for any call to our own
 * `/api/...` routes that requires the caller to be identified - it attaches
 * the current Supabase access token as a Bearer header, which
 * `server/middleware/auth.ts` validates on the way in.
 *
 * Public, unauthenticated routes can keep using plain `$fetch`.
 */
export function useApiFetch<T>(
  url: NitroFetchRequest,
  options: NitroFetchOptions<NitroFetchRequest> = {}
) {
  const authStore = useAuthStore()
  const token = authStore.session?.access_token

  return $fetch<T>(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })
}
