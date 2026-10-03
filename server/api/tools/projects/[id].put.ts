import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, updateProjectBodySchema } from '~~/server/utils/projectBodies'
import { loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError, updateProject } from '~~/server/utils/projects'

// Change a project's name, target date, products, notes or owner (project owner / admin).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = updateProjectBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    await updateProject(db, access, {
      ...parsed.data,
      targetDate: parsed.data.targetDate ?? null,
      products: parsed.data.products ?? null,
      notes: parsed.data.notes ?? null
    })
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
