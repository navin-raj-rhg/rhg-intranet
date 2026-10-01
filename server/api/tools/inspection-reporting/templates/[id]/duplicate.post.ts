import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { inspectionTemplates } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_TOOL_ID, isUniqueViolation, parseInspectionId } from '~~/server/utils/inspections'
import { copyTemplateName } from '~~/shared/utils/inspectionRules'

// Admins: copy a template (sections and points) as "Copy of <name>", switched
// off so it can be edited before inspectors see it. Reports already started
// from the original are untouched.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, INSPECTION_TOOL_ID, ['admin'])
  const id = parseInspectionId(event, 'template')
  const db = useDb()

  const [original] = await db.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, id))
  if (!original) throw createError({ statusCode: 404, statusMessage: 'That template no longer exists.' })

  // Two admins duplicating at once can pick the same name; the unique index
  // refuses the second, so try the next free name.
  for (let attempt = 0; attempt < 5; attempt++) {
    const names = (await db.select({ name: inspectionTemplates.name }).from(inspectionTemplates)).map(r => r.name)
    const name = copyTemplateName(original.name, names)
    try {
      const [row] = await db
        .insert(inspectionTemplates)
        .values({ name, sections: original.sections, active: false, createdBy: profile.id })
        .returning({ id: inspectionTemplates.id, name: inspectionTemplates.name })
      return row
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
    }
  }
  throw createError({ statusCode: 409, statusMessage: 'Could not find a free name for the copy. Try again.' })
})
