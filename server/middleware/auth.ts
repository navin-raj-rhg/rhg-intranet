import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

// Declare the shape we attach to event.context so server routes get
// autocomplete/type-checking on event.context.user.
declare module 'h3' {
  interface H3EventContext {
    user?: User
  }
}

// Remember a checked login for up to a minute so most requests skip the round
// trip to Supabase. A login cancelled in Supabase can therefore still work for
// up to a minute.
const checkedLogins = createTokenCache<User>(60_000)

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return // no token - route handlers that require auth will reject via requireUser()

  const cached = checkedLogins.get(token)
  if (cached) {
    event.context.user = cached
    return
  }

  const config = useRuntimeConfig()
  const supabase = createClient(config.public.supabaseUrl, config.public.supabaseAnonKey)

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return

  const expiresAtMs = tokenExpiryMs(token)
  checkedLogins.set(token, data.user, expiresAtMs)
  event.context.user = data.user
})

// The token's own expiry (seconds since 1970, inside its payload), so a cached
// login is never kept past it.
function tokenExpiryMs(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined
  } catch {
    return undefined
  }
}
