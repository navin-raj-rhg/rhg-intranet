import type { H3Event } from 'h3'
import { useDb } from '~~/server/db/client'
import { requireProfile } from './requireUser'

/**
 * Requires the caller to either be the platform owner (which bypasses every
 * per-tool check, per profiles.isOwner) or to hold at least one of
 * `allowedRoles` for `toolId` in user_tool_roles.
 *
 * A user can hold several roles in one tool (e.g. 'employee' + 'manager'),
 * so this returns:
 *  - `roles`: every one of `allowedRoles` the caller actually holds
 *    (`['owner']` for the owner bypass). Prefer this for branching, e.g.
 *    `roles.includes('manager')`.
 *  - `role`: a single value kept for older callers - 'owner', or the first
 *    held role in `allowedRoles` order. It is NOT reliable for multi-role
 *    users, so new code should use `roles` instead.
 */
export async function requireToolRole(event: H3Event, toolId: string, allowedRoles: string[]) {
  const profile = await requireProfile(event)

  if (profile.isOwner) {
    return { profile, role: 'owner' as const, roles: ['owner'] as string[] }
  }

  const db = useDb()
  const assignments = await db.query.userToolRoles.findMany({
    where: (r, { and, eq }) => and(eq(r.userId, profile.id), eq(r.toolId, toolId))
  })

  const held = assignments.map(a => a.roleKey)
  const roles = allowedRoles.filter(r => held.includes(r))

  if (roles.length === 0) {
    throw createError({
      statusCode: 403,
      statusMessage: `This action requires one of these roles on ${toolId}: ${allowedRoles.join(', ')}`
    })
  }

  return { profile, role: roles[0]!, roles }
}
