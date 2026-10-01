import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { inspectionTemplates } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_TOOL_ID, isUniqueViolation, parseInspectionId, tidyTemplateSections } from '~~/server/utils/inspections'
import { templateBodyProblem, templateBodySchema } from '~~/server/utils/inspectionTemplateBody'

// Admins save changes to a template. Reports already started keep their own
// copy of the points, so this only affects reports started afterwards.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, ['admin'])
  const id = parseInspectionId(event, 'template')
  const parsed = templateBodySchema.safeParse(await readBody(event))
  const problem = templateBodyProblem(parsed)
  if (problem || !parsed.success) throw createError({ statusCode: 400, statusMessage: problem || 'Invalid template.' })

  const name = parsed.data.name.replace(/\s+/g, ' ').trim()
  try {
    const [row] = await useDb()
      .update(inspectionTemplates)
      .set({ name, sections: tidyTemplateSections(parsed.data.sections), active: parsed.data.active, updatedAt: new Date() })
      .where(eq(inspectionTemplates.id, id))
      .returning({ id: inspectionTemplates.id })
    if (!row) throw createError({ statusCode: 404, statusMessage: 'That template no longer exists.' })
    return row
  } catch (err) {
    if (isUniqueViolation(err)) throw createError({ statusCode: 409, statusMessage: `There is already a template called "${name}".` })
    throw err
  }
})
