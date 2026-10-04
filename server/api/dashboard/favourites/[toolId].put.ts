import { and, eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { toolRegistry, userFavouriteTools } from '~~/server/db/schema'

// Star a tool. Starring twice is harmless.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const toolId = getRouterParam(event, 'toolId') ?? ''
  const db = useDb()

  const [tool] = await db
    .select({ id: toolRegistry.id })
    .from(toolRegistry)
    .where(and(eq(toolRegistry.id, toolId), eq(toolRegistry.enabled, true)))
  if (!tool) throw createError({ statusCode: 404, statusMessage: 'That tool does not exist.' })

  await db.insert(userFavouriteTools).values({ userId: profile.id, toolId }).onConflictDoNothing()
  return { ok: true }
})
