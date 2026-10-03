import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimImportSchema } from '~~/server/utils/pimBodies'
import { importPimProducts, PIM_ROLES, PIM_TOOL_ID, pimHttpError, requirePimEditor } from '~~/server/utils/pim'
import { readPimImport } from '~~/shared/utils/pimRules'

// Editors and admins import a CSV. With `apply: false` it only checks the file and says what would
// happen; with `apply: true` it does it (all rows or none).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  requirePimEditor(roles)
  const parsed = pimImportSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const read = readPimImport(parsed.data.csv)
  if (read.problems.length) return { created: 0, updated: 0, problems: read.problems, applied: false }
  try {
    return await importPimProducts(useDb(), profile.id, read.rows, parsed.data.apply)
  } catch (err) {
    pimHttpError(err)
  }
})
