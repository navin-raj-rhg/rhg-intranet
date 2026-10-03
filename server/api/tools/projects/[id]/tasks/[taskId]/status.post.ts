import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, taskStatusBodySchema } from '~~/server/utils/projectBodies'
import { changeTaskStatus, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Move a task between To do / In progress / Done (its assignee, the project owner or an admin).
// Finishing a task unlocks and dates the tasks that were waiting for it.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = taskStatusBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    return await changeTaskStatus(db, access, profile.id, parseProjectId(event, 'taskId', 'task'), parsed.data.status)
  } catch (err) {
    projectHttpError(err)
  }
})
