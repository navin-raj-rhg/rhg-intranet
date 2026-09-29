import { and, eq, inArray, ne, notInArray } from 'drizzle-orm'
import type { useDb } from '../db/client'
import { profiles, toolManagerLinks, toolRegistry, toolRoles, userToolRoles } from '../db/schema'

type Db = ReturnType<typeof useDb>

/** Thrown for any rule violation; the API route turns it into an HTTP error. */
export class ToolAccessError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

/**
 * A tool uses employee -> manager links when it defines BOTH an 'employee'
 * and a 'manager' role (expense claims, leave). Tools with other role sets
 * (e.g. a single 'user' role) have no links at all.
 */
export function toolUsesManagerLinks(roleKeys: string[]) {
  return roleKeys.includes('employee') && roleKeys.includes('manager')
}

export interface SaveToolUserAccessInput {
  toolId: string
  userId: string
  roles: string[]
  managerIds: string[]
}

/**
 * Saves one user's complete access to one tool - their roles AND their
 * linked managers - in a single transaction, so "an employee always has a
 * manager" can never be left half-saved. Rules enforced (all throw
 * ToolAccessError before anything is written):
 *  - the tool and user exist, and every role is defined for that tool
 *  - an employee has at least one manager; nobody is their own manager
 *  - every chosen manager holds the manager role in this tool
 *  - a manager role can't be removed while an employee would be left with
 *    no manager (the message names the employees to reassign first)
 * Removing every role removes the user's links too.
 */
export async function saveToolUserAccess(db: Db, input: SaveToolUserAccessInput) {
  const { toolId, userId } = input

  return db.transaction(async (tx) => {
    const tool = await tx.query.toolRegistry.findFirst({ where: eq(toolRegistry.id, toolId) })
    if (!tool) throw new ToolAccessError(404, 'Tool not found')

    const target = await tx.query.profiles.findFirst({ where: eq(profiles.id, userId) })
    if (!target) throw new ToolAccessError(404, 'User not found')

    const definedKeys = (await tx.select({ k: toolRoles.roleKey }).from(toolRoles).where(eq(toolRoles.toolId, toolId)))
      .map(r => r.k)

    const roles = [...new Set(input.roles)]
    const unknown = roles.filter(r => !definedKeys.includes(r))
    if (unknown.length) {
      throw new ToolAccessError(400, `Unknown role(s) for ${toolId}: ${unknown.join(', ')}`)
    }

    const usesLinks = toolUsesManagerLinks(definedKeys)
    const isEmployee = usesLinks && roles.includes('employee')
    const isManager = usesLinks && roles.includes('manager')
    let managerIds = [...new Set(input.managerIds)]

    if (!usesLinks) {
      if (managerIds.length) throw new ToolAccessError(400, 'This tool does not use manager links')
    } else {
      // Links only exist for employees - anyone else has none.
      if (!isEmployee) managerIds = []

      if (isEmployee) {
        if (managerIds.length === 0) {
          throw new ToolAccessError(400, 'An employee must be linked to at least one manager')
        }
        if (managerIds.includes(userId)) {
          throw new ToolAccessError(400, 'A user cannot be their own manager')
        }
        const validRows = await tx
          .select({ id: userToolRoles.userId })
          .from(userToolRoles)
          .where(and(
            eq(userToolRoles.toolId, toolId),
            eq(userToolRoles.roleKey, 'manager'),
            inArray(userToolRoles.userId, managerIds)
          ))
        const valid = new Set(validRows.map(r => r.id))
        if (managerIds.some(id => !valid.has(id))) {
          throw new ToolAccessError(400, 'Every chosen manager must hold the Manager role in this tool')
        }
      }

      // Losing the manager role: block if any employee would be orphaned.
      if (!isManager) {
        const dependents = (await tx
          .select({ id: toolManagerLinks.employeeId })
          .from(toolManagerLinks)
          .where(and(eq(toolManagerLinks.toolId, toolId), eq(toolManagerLinks.managerId, userId))))
          .map(r => r.id)

        if (dependents.length) {
          const covered = new Set((await tx
            .select({ id: toolManagerLinks.employeeId })
            .from(toolManagerLinks)
            .where(and(
              eq(toolManagerLinks.toolId, toolId),
              inArray(toolManagerLinks.employeeId, dependents),
              ne(toolManagerLinks.managerId, userId)
            ))).map(r => r.id))

          const orphanIds = dependents.filter(id => !covered.has(id))
          if (orphanIds.length) {
            const orphans = await tx
              .select({ name: profiles.fullName, email: profiles.email })
              .from(profiles)
              .where(inArray(profiles.id, orphanIds))
            const names = orphans.map(o => o.name || o.email).join(', ')
            throw new ToolAccessError(
              409,
              `Can't remove the Manager role: ${names} would be left without a manager. Assign them another manager first.`
            )
          }
        }
      }
    }

    // ---- All checks passed - write ----

    // Roles: remove the ones no longer wanted, add the new ones.
    await tx.delete(userToolRoles).where(and(
      eq(userToolRoles.toolId, toolId),
      eq(userToolRoles.userId, userId),
      roles.length ? notInArray(userToolRoles.roleKey, roles) : undefined
    ))
    const existingRoles = (await tx
      .select({ k: userToolRoles.roleKey })
      .from(userToolRoles)
      .where(and(eq(userToolRoles.toolId, toolId), eq(userToolRoles.userId, userId))))
      .map(r => r.k)
    const rolesToAdd = roles.filter(r => !existingRoles.includes(r))
    if (rolesToAdd.length) {
      await tx.insert(userToolRoles).values(rolesToAdd.map(roleKey => ({ userId, toolId, roleKey })))
    }

    if (usesLinks) {
      // This user's own managers: keep exactly `managerIds`.
      await tx.delete(toolManagerLinks).where(and(
        eq(toolManagerLinks.toolId, toolId),
        eq(toolManagerLinks.employeeId, userId),
        managerIds.length ? notInArray(toolManagerLinks.managerId, managerIds) : undefined
      ))
      const existingLinks = (await tx
        .select({ id: toolManagerLinks.managerId })
        .from(toolManagerLinks)
        .where(and(eq(toolManagerLinks.toolId, toolId), eq(toolManagerLinks.employeeId, userId))))
        .map(r => r.id)
      const linksToAdd = managerIds.filter(id => !existingLinks.includes(id))
      if (linksToAdd.length) {
        await tx.insert(toolManagerLinks).values(linksToAdd.map(managerId => ({ toolId, employeeId: userId, managerId })))
      }

      // No longer a manager (already verified nobody is orphaned): drop the
      // links that pointed at them.
      if (!isManager) {
        await tx.delete(toolManagerLinks).where(and(
          eq(toolManagerLinks.toolId, toolId),
          eq(toolManagerLinks.managerId, userId)
        ))
      }
    }

    return { userId, roles, managerIds }
  })
}
