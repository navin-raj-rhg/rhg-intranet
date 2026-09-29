import { and, eq, inArray } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { toolManagerLinks } from '~~/server/db/schema'

/**
 * Helpers for the employee <-> manager links in `tool_manager_links`.
 * These are generic (every tool passes its own toolId), so leave,
 * inspections etc. can reuse them. The platform owner bypasses all team
 * scoping - callers should check for the 'owner' role before using these.
 */

/** Employees who have this manager linked to them. */
export async function getManagedEmployeeIds(toolId: string, managerId: string): Promise<string[]> {
  const rows = await useDb()
    .select({ id: toolManagerLinks.employeeId })
    .from(toolManagerLinks)
    .where(and(eq(toolManagerLinks.toolId, toolId), eq(toolManagerLinks.managerId, managerId)))
  return rows.map(r => r.id)
}

/** Managers linked to this employee (an employee can have several). */
export async function getManagerIdsOf(toolId: string, employeeId: string): Promise<string[]> {
  const rows = await useDb()
    .select({ id: toolManagerLinks.managerId })
    .from(toolManagerLinks)
    .where(and(eq(toolManagerLinks.toolId, toolId), eq(toolManagerLinks.employeeId, employeeId)))
  return rows.map(r => r.id)
}

/** Is `managerId` one of `employeeId`'s linked managers? */
export async function isManagerOf(toolId: string, managerId: string, employeeId: string): Promise<boolean> {
  const row = await useDb().query.toolManagerLinks.findFirst({
    where: (l, { and, eq }) => and(eq(l.toolId, toolId), eq(l.managerId, managerId), eq(l.employeeId, employeeId))
  })
  return !!row
}

/**
 * The manager plus every co-manager who shares at least one employee with
 * them (e.g. D and E, both linked to A, B and C). Used so co-managers can
 * see each other's payroll reports, but managers of other teams cannot.
 */
export async function getPeerManagerIds(toolId: string, managerId: string): Promise<string[]> {
  const employeeIds = await getManagedEmployeeIds(toolId, managerId)
  const peers = new Set<string>([managerId])
  if (employeeIds.length === 0) return [...peers]

  const rows = await useDb()
    .select({ id: toolManagerLinks.managerId })
    .from(toolManagerLinks)
    .where(and(eq(toolManagerLinks.toolId, toolId), inArray(toolManagerLinks.employeeId, employeeIds)))
  rows.forEach(r => peers.add(r.id))
  return [...peers]
}
