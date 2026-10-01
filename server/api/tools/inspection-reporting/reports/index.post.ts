import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { productsBodySchema } from '~~/server/utils/inspectionProductsBody'
import { createInspectionReport, INSPECTION_ROLES, INSPECTION_TOOL_ID, inspectionHttpError } from '~~/server/utils/inspections'

const bodySchema = z.object({
  locationId: z.number({ message: 'Choose a supplier or DC' }).int().positive('Choose a supplier or DC'),
  templateId: z.number({ message: 'Choose a report template' }).int().positive('Choose a report template'),
  products: productsBodySchema.optional(),
  reference: z.string().max(100).nullable().optional(),
  inspectionDate: z.string({ message: 'Enter the inspection date' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the inspection date'),
  notes: z.string().max(4000).nullable().optional()
})

// Inspectors start a draft report from a template. The template's points are
// copied into the report, so later template edits never change it.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid report.' })
  if (Number.isNaN(Date.parse(parsed.data.inspectionDate))) throw createError({ statusCode: 400, statusMessage: 'Enter a valid inspection date' })

  try {
    return await createInspectionReport(useDb(), profile.id, roles, {
      ...parsed.data,
      products: parsed.data.products ?? [],
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null
    })
  } catch (err) {
    inspectionHttpError(err)
  }
})
