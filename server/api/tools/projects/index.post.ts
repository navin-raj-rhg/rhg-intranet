import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, createProjectBodySchema } from '~~/server/utils/projectBodies'
import { createProject, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Start a project: pick a type (or none for a blank project) and a start date.
// The caller becomes its owner.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = createProjectBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await createProject(useDb(), profile.id, {
      ...parsed.data,
      targetDate: parsed.data.targetDate ?? null,
      products: parsed.data.products ?? null,
      notes: parsed.data.notes ?? null
    })
  } catch (err) {
    projectHttpError(err)
  }
})
