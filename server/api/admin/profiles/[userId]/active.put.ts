import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { useDb } from '~~/server/db/client'
import { profiles, toolManagerLinks, toolRegistry } from '~~/server/db/schema'
import { requireOwner } from '~~/server/utils/requireUser'
import { deactivationProblem } from '~~/shared/utils/deactivation'

const paramsSchema = z.object({ userId: z.string().uuid() })
const bodySchema = z.object({ active: z.boolean() })

// Owner-only: deactivate someone who has left (or reactivate them). Their
// history is kept; they are refused by every route and hidden from pickers.
// Refused while they still manage employees who are active, and for owners.
export default defineEventHandler(async (event) => {
  const owner = await requireOwner(event)
  const { userId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Say whether to deactivate or reactivate.' })

  const db = useDb()
  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  const name = target.fullName || target.email

  if (!parsed.data.active) {
    const employee = alias(profiles, 'employee')
    const rows = await db
      .select({ toolName: toolRegistry.name, employeeName: employee.fullName, employeeEmail: employee.email })
      .from(toolManagerLinks)
      .innerJoin(employee, eq(employee.id, toolManagerLinks.employeeId))
      .innerJoin(toolRegistry, eq(toolRegistry.id, toolManagerLinks.toolId))
      .where(and(eq(toolManagerLinks.managerId, userId), isNull(employee.deactivatedAt)))

    const byTool = new Map<string, string[]>()
    for (const r of rows) {
      byTool.set(r.toolName, [...(byTool.get(r.toolName) ?? []), r.employeeName || r.employeeEmail])
    }

    const problem = deactivationProblem({
      name,
      isOwner: target.isOwner,
      isSelf: target.id === owner.id,
      teams: [...byTool].map(([toolName, employeeNames]) => ({ toolName, employeeNames }))
    })
    if (problem) throw createError({ statusCode: 409, statusMessage: problem })
  }

  const [updated] = await db
    .update(profiles)
    .set({ deactivatedAt: parsed.data.active ? null : new Date(), updatedAt: new Date() })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id, deactivatedAt: profiles.deactivatedAt })
  return updated
})
