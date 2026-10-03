import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deleteProjectTask, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Project owner / admin deletes a task; tasks waiting for it inherit its links.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    await deleteProjectTask(db, access, parseProjectId(event, 'taskId', 'task'))
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
