import { and, eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { userFavouriteTools } from '~~/server/db/schema'

// Un-star a tool.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const toolId = getRouterParam(event, 'toolId') ?? ''
  await useDb()
    .delete(userFavouriteTools)
    .where(and(eq(userFavouriteTools.userId, profile.id), eq(userFavouriteTools.toolId, toolId)))
  return { ok: true }
})
