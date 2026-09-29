import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { toolUsesManagerLinks } from '~~/server/utils/toolAccess'

const paramsSchema = z.object({ toolId: z.string().min(1) })

// Owner-only. The roles a tool defines (from tool_roles), so the admin screen
// never hard-codes them, plus whether the tool uses employee -> manager links.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const { toolId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const db = useDb()
  const tool = await db.query.toolRegistry.findFirst({
    where: (t, { eq }) => eq(t.id, toolId)
  })
  if (!tool) {
    throw createError({ statusCode: 404, statusMessage: 'Tool not found' })
  }

  const roles = await db.query.toolRoles.findMany({
    where: (r, { eq }) => eq(r.toolId, toolId),
    orderBy: (r, { asc }) => asc(r.id)
  })

  return {
    toolId,
    toolName: tool.name,
    usesManagerLinks: toolUsesManagerLinks(roles.map(r => r.roleKey)),
    roles: roles.map(r => ({ roleKey: r.roleKey, roleLabel: r.roleLabel }))
  }
})
