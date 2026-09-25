import type { User } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { useDb } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'

/** Throws 401 if the request wasn't authenticated (see server/middleware/auth.ts). */
export function requireUser(event: H3Event): User {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  return user
}

/**
 * Requires an authenticated user AND their profile row. If the profile
 * doesn't exist yet (e.g. the DB trigger that creates it on signup hasn't
 * been set up, or ran before this migration existed), it's created here as
 * a fallback so the app keeps working either way.
 */
export async function requireProfile(event: H3Event) {
  const user = requireUser(event)
  const db = useDb()

  let profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id)
  })

  if (!profile) {
    const [inserted] = await db
      .insert(profiles)
      .values({ id: user.id, email: user.email ?? '' })
      .returning()

    if (!inserted) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to create profile' })
    }
    profile = inserted
  }

  return profile
}

/** Throws 403 if the caller's profile isn't marked as the platform owner. */
export async function requireOwner(event: H3Event) {
  const profile = await requireProfile(event)
  if (!profile.isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Owner access required' })
  }
  return profile
}
