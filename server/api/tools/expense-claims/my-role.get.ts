import { getManagerIdsOf } from '~~/server/utils/toolTeams'
import { requireToolRole } from '~~/server/utils/requireToolRole'

export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, 'expense-claims', ['employee', 'manager'])

  // An employee with no linked manager can't submit claims (nobody could
  // approve them) - the page uses this flag to explain why.
  const isEmployeeOnly = roles.includes('employee') && !roles.includes('owner')
  const missingManager = isEmployeeOnly
    && (await getManagerIdsOf('expense-claims', profile.id)).length === 0

  return { roles, missingManager }
})
