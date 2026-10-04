import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { userFavouriteTools } from '~~/server/db/schema'

// The ids of the tools the caller has starred. The dashboard only shows the ones
// they can still open.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const rows = await useDb()
    .select({ toolId: userFavouriteTools.toolId })
    .from(userFavouriteTools)
    .where(eq(userFavouriteTools.userId, profile.id))
    .orderBy(userFavouriteTools.createdAt)
  return rows.map(r => r.toolId)
})
