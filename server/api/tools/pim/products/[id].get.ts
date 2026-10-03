import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getPimProduct, parsePimId, PIM_ROLES, PIM_TOOL_ID, pimHttpError } from '~~/server/utils/pim'

export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  try {
    return await getPimProduct(useDb(), parsePimId(event))
  } catch (err) {
    pimHttpError(err)
  }
})
