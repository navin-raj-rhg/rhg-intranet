import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'

const paramsSchema = z.object({ toolId: z.string().min(1) })

// Owner-only. Every signed-up user with the roles they hold in this tool and
// (for tools that use them) which managers they're linked to.
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

  const [users, roleRows, linkRows] = await Promise.all([
    db.query.profiles.findMany({ orderBy: (p, { asc }) => asc(p.createdAt) }),
    db.query.userToolRoles.findMany({ where: (r, { eq }) => eq(r.toolId, toolId) }),
    db.query.toolManagerLinks.findMany({ where: (l, { eq }) => eq(l.toolId, toolId) })
  ])

  return users.map(u => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    isOwner: u.isOwner,
    // Shown so the owner can see and fix who is missing them (they drive leave tiers).
    joinDate: u.joinDate,
    dateOfBirth: u.dateOfBirth,
    createdAt: u.createdAt,
    deactivatedAt: u.deactivatedAt,
    roles: roleRows.filter(r => r.userId === u.id).map(r => r.roleKey),
    managerIds: linkRows.filter(l => l.employeeId === u.id).map(l => l.managerId)
  }))
})
