import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { buildLeaveBalances, loadLeaveContext, todayISO } from '~~/server/utils/leaveBalance'

const paramsSchema = z.object({ userId: z.string().uuid() })
const querySchema = z.object({ asOf: z.string().date().optional() })

// Owner-only. Any employee's balances, in the same shape as the employee's own
// /balances route, so the owner can see the effect of an adjustment.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const { userId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const query = await getValidatedQuery(event, querySchema.parse)

  const asOf = query.asOf ?? todayISO()
  const ctx = await loadLeaveContext(useDb(), userId)

  return {
    asOf,
    joinDateMissing: ctx.profile.joinDate === null,
    dateOfBirthMissing: ctx.profile.dateOfBirth === null,
    types: buildLeaveBalances(ctx, asOf)
  }
})
