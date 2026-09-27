import type { H3Event } from 'h3'
import { useDb } from '~~/server/db/client'
import { requireProfile } from './requireUser'

/**
 * Requires the caller to either be the platform owner (which bypasses every
 * per-tool check, per profiles.isOwner) or to hold one of `allowedRoles` for
 * `toolId` in user_tool_roles.
 *
 * Returns the profile plus the resolved role - 'owner' if they got in via
 * the bypass, otherwise their actual tool_roles.role_key - so route handlers
 * can branch on it (e.g. "owner and manager see everything, employee sees
 * only their own rows").
 */
export async function requireToolRole(event: H3Event, toolId: string, allowedRoles: string[]) {
  const profile = await requireProfile(event)

  if (profile.isOwner) {
    return { profile, role: 'owner' as const }
  }

  const db = useDb()
  const assignment = await db.query.userToolRoles.findFirst({
    where: (r, { and, eq }) => and(eq(r.userId, profile.id), eq(r.toolId, toolId))
  })

  if (!assignment || !allowedRoles.includes(assignment.roleKey)) {
    throw createError({
      statusCode: 403,
      statusMessage: `This action requires one of these roles on ${toolId}: ${allowedRoles.join(', ')}`
    })
  }

  return { profile, role: assignment.roleKey }
}
