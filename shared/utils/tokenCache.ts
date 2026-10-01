/**
 * A tiny in-memory cache for "this login token is valid", so the server doesn't
 * ask Supabase on every single request. Entries last at most `ttlMs` and never
 * past the token's own expiry. Only successful checks are stored.
 */
export interface TokenCache<T> {
  get: (token: string, now?: number) => T | undefined
  set: (token: string, value: T, tokenExpiresAtMs?: number, now?: number) => void
  size: () => number
}

export function createTokenCache<T>(ttlMs = 60_000, maxEntries = 500): TokenCache<T> {
  const entries = new Map<string, { value: T, expiresAt: number }>()

  return {
    get(token, now = Date.now()) {
      const hit = entries.get(token)
      if (!hit) return undefined
      if (hit.expiresAt <= now) {
        entries.delete(token)
        return undefined
      }
      return hit.value
    },
    set(token, value, tokenExpiresAtMs, now = Date.now()) {
      const limit = now + ttlMs
      const expiresAt = tokenExpiresAtMs === undefined ? limit : Math.min(limit, tokenExpiresAtMs)
      if (expiresAt <= now) return
      if (entries.size >= maxEntries) {
        // Drop anything stale first; if still full, drop the oldest entry.
        for (const [key, e] of entries) if (e.expiresAt <= now) entries.delete(key)
        if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!)
      }
      entries.set(token, { value, expiresAt })
    },
    size: () => entries.size
  }
}
