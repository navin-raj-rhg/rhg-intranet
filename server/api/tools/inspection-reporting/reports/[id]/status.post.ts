import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { changeInspectionStatus, INSPECTION_ROLES, INSPECTION_TOOL_ID, inspectionHttpError, parseInspectionId } from '~~/server/utils/inspections'

const bodySchema = z.object({
  action: z.enum(['submit', 'return', 'close'], { message: 'Unknown action.' }),
  comment: z.string().max(2000, 'The comment is too long (2000 characters at most)').nullable().optional()
})

// submit: inspector sends a draft to review. return / close: reviewer sends an
// in-review report back to draft (comment required) or closes it (freezing the result).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const id = parseInspectionId(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid request.' })

  try {
    return await changeInspectionStatus(useDb(), id, profile.id, roles, parsed.data.action, parsed.data.comment ?? null)
  } catch (err) {
    inspectionHttpError(err)
  }
})
