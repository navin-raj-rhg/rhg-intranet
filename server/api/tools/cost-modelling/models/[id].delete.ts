import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { costModels } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'

// Only admins (and the owner) can delete a model. Its product rows go with it;
// copies made from it are kept (they just lose their "duplicated from" link).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid cost model.' })

  const deleted = await useDb()
    .delete(costModels)
    .where(eq(costModels.id, id))
    .returning({ id: costModels.id, name: costModels.name })
  if (!deleted[0]) throw createError({ statusCode: 404, statusMessage: 'That cost model no longer exists.' })
  return deleted[0]
})
