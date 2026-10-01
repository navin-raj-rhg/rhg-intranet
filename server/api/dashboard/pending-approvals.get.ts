import { and, count, eq, inArray, ne } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseClaims, leaveApplications } from '~~/server/db/schema'
import { requireProfile } from '~~/server/utils/requireUser'
import { getManagedEmployeeIds } from '~~/server/utils/toolTeams'

// What is waiting for the signed-in person to approve: submitted expense claims
// and pending leave applications from their team. Only managers (and the
// owner, who sees everyone) get numbers; everyone else gets zeros. Drives the
// "waiting for your approval" alert on the dashboard. Nobody is asked to
// approve their own leave, so that is not counted.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const db = useDb()

  const roleRows = await db.query.userToolRoles.findMany({
    where: (r, { and, eq }) => and(eq(r.userId, profile.id), eq(r.roleKey, 'manager'))
  })
  const managesIn = (toolId: string) => profile.isOwner || roleRows.some(r => r.toolId === toolId)

  async function expenseCount() {
    if (!managesIn('expense-claims')) return 0
    const conditions = [eq(expenseClaims.status, 'submitted')]
    if (!profile.isOwner) {
      const ids = await getManagedEmployeeIds('expense-claims', profile.id)
      if (ids.length === 0) return 0
      conditions.push(inArray(expenseClaims.employeeId, ids))
    }
    const [row] = await db.select({ n: count() }).from(expenseClaims).where(and(...conditions))
    return row?.n ?? 0
  }

  async function leaveCount() {
    if (!managesIn('leave-applications')) return 0
    const conditions = [eq(leaveApplications.status, 'pending'), ne(leaveApplications.employeeId, profile.id)]
    if (!profile.isOwner) {
      const ids = await getManagedEmployeeIds('leave-applications', profile.id)
      if (ids.length === 0) return 0
      conditions.push(inArray(leaveApplications.employeeId, ids))
    }
    const [row] = await db.select({ n: count() }).from(leaveApplications).where(and(...conditions))
    return row?.n ?? 0
  }

  const [expenseClaimsWaiting, leaveWaiting] = await Promise.all([expenseCount(), leaveCount()])
  return { expenseClaims: expenseClaimsWaiting, leave: leaveWaiting }
})
