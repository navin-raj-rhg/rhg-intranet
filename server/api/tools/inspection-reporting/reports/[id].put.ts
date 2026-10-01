import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { productsBodySchema } from '~~/server/utils/inspectionProductsBody'
import { INSPECTION_ROLES, INSPECTION_TOOL_ID, inspectionHttpError, parseInspectionId, saveInspectionDraft } from '~~/server/utils/inspections'

const bodySchema = z.object({
  locationId: z.number({ message: 'Choose a supplier or DC' }).int().positive('Choose a supplier or DC'),
  products: productsBodySchema,
  reference: z.string().max(100).nullable(),
  inspectionDate: z.string({ message: 'Enter the inspection date' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the inspection date'),
  notes: z.string().max(4000).nullable(),
  points: z
    .array(z.object({
      id: z.number().int().positive(),
      result: z.enum(['compliant', 'non_conformance', 'na']).nullable(),
      severity: z.enum(['minor', 'major']).nullable(),
      comment: z.string().max(4000, 'A comment is too long (4000 characters at most)').nullable()
    }))
    .max(1000)
})

// Save a draft: header plus every point's answer and comment, in one go.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const id = parseInspectionId(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid report.' })
  if (Number.isNaN(Date.parse(parsed.data.inspectionDate))) throw createError({ statusCode: 400, statusMessage: 'Enter a valid inspection date' })

  try {
    return await saveInspectionDraft(useDb(), id, profile.id, roles, parsed.data)
  } catch (err) {
    inspectionHttpError(err)
  }
})
