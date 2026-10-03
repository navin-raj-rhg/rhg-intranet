import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, projectStatusBodySchema } from '~~/server/utils/projectBodies'
import { loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError, setProjectStatus } from '~~/server/utils/projects'

// Close or reopen a project (project owner / admin).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = projectStatusBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    await setProjectStatus(db, await loadProjectAccess(db, parseProjectId(event), profile.id, roles), parsed.data.status)
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
