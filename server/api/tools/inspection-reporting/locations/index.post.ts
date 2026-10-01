import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { inspectionLocations } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_TOOL_ID, isUniqueViolation } from '~~/server/utils/inspections'
import { INSPECTION_NAME_MAX } from '~~/shared/utils/inspectionRules'

const bodySchema = z.object({
  type: z.enum(['supplier', 'dc'], { message: 'Choose Supplier or DC' }),
  name: z.string({ message: 'Enter a name' })
})

// Admins add a supplier or DC to the list inspectors choose from.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, ['admin'])
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid entry.' })

  const name = parsed.data.name.replace(/\s+/g, ' ').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Enter a name' })
  if (name.length > INSPECTION_NAME_MAX) throw createError({ statusCode: 400, statusMessage: `The name must be ${INSPECTION_NAME_MAX} characters or fewer` })

  try {
    const [row] = await useDb()
      .insert(inspectionLocations)
      .values({ type: parsed.data.type, name })
      .returning({ id: inspectionLocations.id, type: inspectionLocations.type, name: inspectionLocations.name, active: inspectionLocations.active })
    return row
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, statusMessage: `"${name}" is already in the ${parsed.data.type === 'dc' ? 'DC' : 'supplier'} list.` })
    }
    throw err
  }
})
