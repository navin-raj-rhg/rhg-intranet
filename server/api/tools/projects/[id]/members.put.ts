import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, membersBodySchema } from '~~/server/utils/projectBodies'
import { loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError, setProjectMembers } from '~~/server/utils/projects'

// Set who is in a project (project owner / admin). The owner always stays in.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = membersBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    await setProjectMembers(db, await loadProjectAccess(db, parseProjectId(event), profile.id, roles), parsed.data.memberIds)
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
