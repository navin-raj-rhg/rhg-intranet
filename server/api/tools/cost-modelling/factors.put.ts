import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import {
  COST_TOOL_ID,
  CostFactorsError,
  loadCostFactors,
  saveCostFactors
} from '~~/server/utils/costFactors'
import { factorsNotReadyReason } from '~~/shared/utils/costFactors'

const money = z.number().finite().min(0, 'Costs cannot be negative').max(1_000_000)
const id = z.number().int().positive()

const bodySchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  usdToAud: z.number().finite().positive('Enter the USD to AUD rate').max(1000),
  cnyToAud: z.number().finite().positive('Enter the CNY to AUD rate').max(1000),
  containerCbm20: z.number().finite().positive('Container CBM must be more than 0').max(200),
  containerCbm40hc: z.number().finite().positive('Container CBM must be more than 0').max(200),
  freight: z.array(z.object({ originPortId: id, destinationPortId: id, usd20: money, usd40hc: money })).max(1000),
  localCosts: z.array(z.object({ destinationPortId: id, feeTypeId: id, aud20: money, aud40hc: money })).max(5000)
})

// Only admins (and the owner) edit Factors. Saved models are unaffected: they
// keep their own copy of the Factors they were costed with.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, COST_TOOL_ID, ['admin'])

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid Factors.' })
  }

  const db = useDb()
  try {
    await saveCostFactors(db, profile.id, parsed.data)
  } catch (err) {
    if (err instanceof CostFactorsError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }

  // Same shape as GET, so the screen can just replace what it holds.
  const factors = await loadCostFactors(db)
  return { ...factors, canEdit: true, notReadyReason: factorsNotReadyReason(factors) }
})
