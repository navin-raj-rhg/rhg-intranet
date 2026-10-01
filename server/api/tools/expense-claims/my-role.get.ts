import { getManagerIdsOf } from '~~/server/utils/toolTeams'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { useDb } from '~~/server/db/client'

export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, 'expense-claims', ['employee', 'manager'])

  // The owner bypasses role checks, so `roles` is just ['owner']. If the owner has
  // also been ticked as Employee (or Manager) in Manage access, report that too, so
  // the page offers "My claims" like it does for anyone else with that role.
  let reported = roles
  if (roles.includes('owner')) {
    const held = await useDb().query.userToolRoles.findMany({
      where: (r, { and, eq }) => and(eq(r.userId, profile.id), eq(r.toolId, 'expense-claims'))
    })
    reported = [...new Set([...roles, ...held.map(r => r.roleKey)])]
  }

  // An employee with no linked manager can't submit claims (nobody could
  // approve them) - the page uses this flag to explain why. The owner is exempt.
  const isEmployeeOnly = roles.includes('employee') && !roles.includes('owner')
  const missingManager = isEmployeeOnly
    && (await getManagerIdsOf('expense-claims', profile.id)).length === 0

  return { roles: reported, missingManager }
})
