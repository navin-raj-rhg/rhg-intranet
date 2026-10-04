import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID } from '~~/server/utils/costFactors'
import { CostModelError, saveCostModel } from '~~/server/utils/costModels'
import { createMissingPimProducts } from '~~/server/utils/costPimSync'
import { COST_MODEL_MAX_ROWS } from '~~/shared/utils/costModel'

const cm = z.number().finite().positive('Carton/pallet sizes must be more than 0').max(10_000).nullable()
const qty = z.number().int('Quantities inside must be whole numbers').positive('Quantities inside must be more than 0').max(10_000_000).nullable()
const level = z.object({ lengthCm: cm, widthCm: cm, heightCm: cm, qtyInside: qty })
const money = z.number().finite().min(0, 'Prices and costs cannot be negative').max(100_000_000).nullable()
const text = (max: number) => z.string().max(max).nullable()

const rowSchema = z.object({
  productNo: text(100),
  description: text(500),
  carton: level,
  outer: level,
  pallet: level,
  fobCurrency: z.enum(['USD', 'CNY']),
  fobPrice: money,
  toolingCost: money,
  dutyPercent: z.number().finite().min(0, 'Duty % cannot be negative').max(100, 'Duty % cannot be over 100').nullable(),
  buyerBuyPrice: money,
  rrpIncGst: money
})

const bodySchema = z.object({
  supplierName: z.string().max(120, 'Supplier name is too long'),
  categoryId: z.number({ message: 'Choose a category' }).int().positive(),
  subCategoryId: z.number().int().positive().nullable(),
  originPortId: z.number({ message: 'Choose a ship-from port' }).int().positive(),
  containerBasis: z.enum(['c20', 'c40hc']),
  notes: z.string().max(2000).nullable().optional(),
  duplicatedFromId: z.number().int().positive().nullable().optional(),
  factorsUpdatedAt: z.string().datetime({ offset: true }),
  rows: z.array(rowSchema).min(1, 'Add at least one product').max(COST_MODEL_MAX_ROWS * 2)
})

// Any Cost Modelling user can save a model. Saved models are final: there is
// no update route - a change is made by duplicating into a new model.
// Also adds any product the PIM doesn't have yet (Step 20.3).
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, COST_TOOL_ID, COST_ROLES)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path[0] === 'rows' && typeof issue.path[1] === 'number' ? `Row ${issue.path[1] + 1}: ` : ''
    throw createError({ statusCode: 400, statusMessage: `${where}${issue?.message ?? 'Invalid cost model.'}` })
  }

  try {
    const db = useDb()
    const saved = await saveCostModel(db, profile.id, parsed.data)
    // Products the PIM doesn't know yet are added there as Drafts (Step 20.3).
    // This can't fail the save: problems come back in `pim.skipped`.
    const pim = await createMissingPimProducts(
      db,
      profile.id,
      { name: saved.name, supplierName: parsed.data.supplierName, categoryId: parsed.data.categoryId, subCategoryId: parsed.data.subCategoryId },
      parsed.data.rows
    )
    return { ...saved, pim }
  } catch (err) {
    if (err instanceof CostModelError) throw createError({ statusCode: err.status, statusMessage: err.message })
    throw err
  }
})
