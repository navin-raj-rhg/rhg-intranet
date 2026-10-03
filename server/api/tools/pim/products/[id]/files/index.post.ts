import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimFileRegisterSchema } from '~~/server/utils/pimBodies'
import { parsePimId, PIM_ROLES, PIM_TOOL_ID, pimHttpError, registerPimFile, requirePimEditor } from '~~/server/utils/pim'

// Step 3 of adding a file: after the browser has uploaded it, the server checks it really arrived
// and records it. The first image added becomes the main image.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  requirePimEditor(roles)
  const parsed = pimFileRegisterSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await registerPimFile(useDb(), profile.id, parsePimId(event), parsed.data)
  } catch (err) {
    pimHttpError(err)
  }
})
