import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { listProjects, PROJECTS_ROLES, PROJECTS_TOOL_ID } from '~~/server/utils/projects'

// Projects the caller is a member of. Admins can add ?all=1 to see every project,
// and ?status=open|closed to filter.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const query = getQuery(event)
  const status = query.status === 'open' || query.status === 'closed' ? query.status : undefined
  return await listProjects(useDb(), profile.id, roles, { all: query.all === '1', status })
})
