import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, commentBodySchema } from '~~/server/utils/projectBodies'
import { addTaskComment, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Add a comment to a task (members, admins and the owner).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = commentBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    return await addTaskComment(db, access.project.id, parseProjectId(event, 'taskId', 'task'), profile.id, parsed.data.body)
  } catch (err) {
    projectHttpError(err)
  }
})
