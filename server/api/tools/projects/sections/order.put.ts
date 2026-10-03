import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, sectionOrderBodySchema } from '~~/server/utils/projectBodies'
import { PROJECTS_TOOL_ID, projectHttpError, reorderProjectSections } from '~~/server/utils/projects'

// Admins set the order of the sections (send every section id in the order wanted).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PROJECTS_TOOL_ID, ['admin'])
  const parsed = sectionOrderBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    await reorderProjectSections(useDb(), parsed.data.ids)
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
