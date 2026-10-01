import { asc } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { inspectionTemplates } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_ROLES, INSPECTION_TOOL_ID } from '~~/server/utils/inspections'
import { isInspectionAdmin } from '~~/shared/utils/inspectionRules'

// Report templates with section / point counts. Everyone sees the active ones
// (to start a report); admins also see switched-off ones.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const rows = await useDb()
    .select({
      id: inspectionTemplates.id,
      name: inspectionTemplates.name,
      sections: inspectionTemplates.sections,
      active: inspectionTemplates.active,
      updatedAt: inspectionTemplates.updatedAt
    })
    .from(inspectionTemplates)
    .orderBy(asc(inspectionTemplates.name))
  const admin = isInspectionAdmin(roles)
  return rows
    .filter(t => admin || t.active)
    .map(t => ({
      id: t.id,
      name: t.name,
      active: t.active,
      sectionCount: t.sections.length,
      pointCount: t.sections.reduce((n, s) => n + s.points.length, 0),
      updatedAt: t.updatedAt.toISOString()
    }))
})
