import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'

export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const db = useDb()

  const existingOwner = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.isOwner, true)
  })

  if (existingOwner) {
    throw createError({
      statusCode: 403,
      statusMessage: 'An owner has already been set for this workspace.'
    })
  }

  const [updated] = await db
    .update(profiles)
    .set({ isOwner: true, updatedAt: new Date() })
    .where(eq(profiles.id, profile.id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update profile' })
  }

  return updated
})
