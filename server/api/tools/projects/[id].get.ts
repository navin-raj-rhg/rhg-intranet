import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { loadProjectAccess, loadProjectView, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// One project with its members and tasks. Members, admins and the owner only.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const db = useDb()
  try {
    return await loadProjectView(db, await loadProjectAccess(db, parseProjectId(event), profile.id, roles))
  } catch (err) {
    projectHttpError(err)
  }
})
