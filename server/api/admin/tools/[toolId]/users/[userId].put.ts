import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { saveToolUserAccess, ToolAccessError } from '~~/server/utils/toolAccess'

const paramsSchema = z.object({
  toolId: z.string().min(1),
  userId: z.string().uuid()
})

const bodySchema = z.object({
  roles: z.array(z.string().min(1)),
  managerIds: z.array(z.string().uuid()).default([])
})

// Owner-only. Replaces one user's whole access to one tool (roles + linked
// managers) in a single transaction. See saveToolUserAccess for the rules.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const { toolId, userId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  try {
    return await saveToolUserAccess(useDb(), { toolId, userId, ...body })
  } catch (err) {
    if (err instanceof ToolAccessError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
})
