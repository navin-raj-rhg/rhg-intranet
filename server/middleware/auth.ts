import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

// Declare the shape we attach to event.context so server routes get
// autocomplete/type-checking on event.context.user.
declare module 'h3' {
  interface H3EventContext {
    user?: User
  }
}

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return // no token - route handlers that require auth will reject via requireUser()

  const config = useRuntimeConfig()
  const supabase = createClient(config.public.supabaseUrl, config.public.supabaseAnonKey)

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return

  event.context.user = data.user
})
