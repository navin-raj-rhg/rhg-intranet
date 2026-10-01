import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { inspectionLocations } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_TOOL_ID, isUniqueViolation, parseInspectionId } from '~~/server/utils/inspections'
import { INSPECTION_NAME_MAX } from '~~/shared/utils/inspectionRules'

const bodySchema = z.object({ name: z.string(), active: z.boolean() })

// Admins rename a supplier/DC or switch it off (off = hidden from new reports;
// existing reports keep the name they were made with). Nothing is deleted.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, ['admin'])
  const id = parseInspectionId(event, 'supplier or DC')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter a name.' })

  const name = parsed.data.name.replace(/\s+/g, ' ').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Enter a name' })
  if (name.length > INSPECTION_NAME_MAX) throw createError({ statusCode: 400, statusMessage: `The name must be ${INSPECTION_NAME_MAX} characters or fewer` })

  try {
    const [row] = await useDb()
      .update(inspectionLocations)
      .set({ name, active: parsed.data.active })
      .where(eq(inspectionLocations.id, id))
      .returning({ id: inspectionLocations.id, type: inspectionLocations.type, name: inspectionLocations.name, active: inspectionLocations.active })
    if (!row) throw createError({ statusCode: 404, statusMessage: 'That supplier or DC no longer exists.' })
    return row
  } catch (err) {
    if (isUniqueViolation(err)) throw createError({ statusCode: 409, statusMessage: `"${name}" is already in that list.` })
    throw err
  }
})
