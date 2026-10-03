import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimFileUploadSchema } from '~~/server/utils/pimBodies'
import { createPimFileUpload, parsePimId, PIM_ROLES, PIM_TOOL_ID, pimHttpError, requirePimEditor } from '~~/server/utils/pim'

// Step 1 of adding a file: if it is an allowed kind and size, the browser gets a short-lived link
// that accepts a file of exactly that size.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  requirePimEditor(roles)
  const parsed = pimFileUploadSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await createPimFileUpload(useDb(), parsePimId(event), parsed.data)
  } catch (err) {
    pimHttpError(err)
  }
})
