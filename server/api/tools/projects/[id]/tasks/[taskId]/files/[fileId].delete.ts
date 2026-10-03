import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deleteTaskFile, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Remove a file from a task (whoever attached it, the project owner or an admin).
// The stored file is deleted too (best effort).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    await deleteTaskFile(db, access, profile.id, parseProjectId(event, 'taskId', 'task'), parseProjectId(event, 'fileId', 'file'))
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
