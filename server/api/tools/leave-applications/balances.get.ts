import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { LEAVE_TOOL_ID, buildLeaveBalances, loadLeaveContext, todayISO } from '~~/server/utils/leaveBalance'

const querySchema = z.object({
  // Optional 'YYYY-MM-DD'. Defaults to today (company timezone). Picks the
  // leave cycle and the service tier, so the form can preview a future date.
  asOf: z.string().date().optional()
})

// The caller's own balances for every active leave type. Read-only.
export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  const { profile } = await requireToolRole(event, LEAVE_TOOL_ID, ['employee'])

  const asOf = query.asOf ?? todayISO()
  const ctx = await loadLeaveContext(useDb(), profile.id)

  return {
    asOf,
    // The form uses these to tell the person what the owner still needs to fill in.
    joinDateMissing: ctx.profile.joinDate === null,
    dateOfBirthMissing: ctx.profile.dateOfBirth === null,
    types: buildLeaveBalances(ctx, asOf)
  }
})
