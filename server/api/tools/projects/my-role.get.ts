import { requireToolRole } from '~~/server/utils/requireToolRole'
import { isProjectsAdmin, PROJECTS_ROLES, PROJECTS_TOOL_ID } from '~~/server/utils/projects'

// Which tabs/buttons the Projects page shows. The API enforces the same rules
// on every route; this is only for the screen.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  return { roles, isAdmin: isProjectsAdmin(roles), canCreate: true }
})
