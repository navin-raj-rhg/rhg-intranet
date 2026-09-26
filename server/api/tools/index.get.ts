import { useDb } from '~~/server/db/client'

// Returns tools the current user can access:
// - the platform owner sees every enabled tool, bypassing user_tool_roles entirely
// - everyone else sees only tools they have a role in (a row in user_tool_roles)
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const db = useDb()

  if (profile.isOwner) {
    return db.query.toolRegistry.findMany({
      where: (tool, { eq }) => eq(tool.enabled, true)
    })
  }

  const roles = await db.query.userToolRoles.findMany({
    where: (utr, { eq }) => eq(utr.userId, profile.id)
  })

  const toolIds = roles.map(role => role.toolId)
  if (toolIds.length === 0) return []

  return db.query.toolRegistry.findMany({
    where: (tool, { and, eq, inArray }) => and(
      eq(tool.enabled, true),
      inArray(tool.id, toolIds)
    )
  })
})