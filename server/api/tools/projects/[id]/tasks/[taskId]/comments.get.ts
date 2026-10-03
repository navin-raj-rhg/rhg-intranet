import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { listTaskComments, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Comments on a task, oldest first (members, admins and the owner).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    return await listTaskComments(db, access.project.id, parseProjectId(event, 'taskId', 'task'))
  } catch (err) {
    projectHttpError(err)
  }
})
