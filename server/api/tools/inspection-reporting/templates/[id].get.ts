import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { inspectionTemplates } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_ROLES, INSPECTION_TOOL_ID, parseInspectionId } from '~~/server/utils/inspections'

// One template with all its sections and points (the form builder loads this).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const id = parseInspectionId(event, 'template')
  const [t] = await useDb().select().from(inspectionTemplates).where(eq(inspectionTemplates.id, id))
  if (!t) throw createError({ statusCode: 404, statusMessage: 'That template no longer exists.' })
  return { id: t.id, name: t.name, active: t.active, sections: t.sections, updatedAt: t.updatedAt.toISOString() }
})
