import { and, count, desc, eq, exists, ilike, like, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { useDb } from '~~/server/db/client'
import {
  costCategories,
  costModelRows,
  costModels,
  costPorts,
  costSubCategories,
  profiles
} from '~~/server/db/schema'
import { loadCostFactors } from '~~/server/utils/costFactors'
import { buildCostFactorsSnapshot, factorsNotReadyReason } from '~~/shared/utils/costFactors'
import {
  calculateCostRow,
  costModelName,
  costModelRowProblems,
  nextCostModelName,
  costRowHasContent,
  type PackLevelInput
} from '~~/shared/utils/costModel'
import { tidyCostName } from '~~/shared/utils/costCategories'
import { todayMY } from '~~/shared/utils/dates'
import type {
  CostModelDetail,
  CostModelListItem,
  CostModelListResponse,
  CostModelRowInput,
  CostProductSuggestion,
  SaveCostModelBody
} from '~~/shared/types/costModelling'

type Db = ReturnType<typeof useDb>

export class CostModelError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const numOrNull = (v: string | number | null) => (v === null ? null : Number(v))
const strOrNull = (n: number | null) => (n === null ? null : String(n))
const personName = (fullName: string | null, email: string | null) => fullName || email || 'Unknown'

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

/**
 * Saves a new model. The figures are recalculated HERE from the live Factors
 * (whatever the browser sent is only inputs), and both the Factors and the
 * figures are frozen on the model. If Factors changed after the screen loaded
 * them, the save is refused so nobody saves numbers they didn't see.
 */
export async function saveCostModel(db: Db, userId: string, body: SaveCostModelBody): Promise<{ id: number, name: string }> {
  const supplierName = tidyCostName(body.supplierName)
  if (!supplierName) throw new CostModelError(400, 'Enter the supplier name')

  const problems = costModelRowProblems(body.rows)
  if (problems.length) throw new CostModelError(400, problems[0]!)

  const factors = await loadCostFactors(db)
  const notReady = factorsNotReadyReason(factors)
  if (notReady) throw new CostModelError(409, notReady)
  if (new Date(factors.settings.updatedAt).getTime() !== new Date(body.factorsUpdatedAt).getTime()) {
    throw new CostModelError(
      409,
      'Factors were updated while you were working. The figures on screen have been refreshed - please check them and save again.'
    )
  }

  const [category] = await db.select().from(costCategories).where(eq(costCategories.id, body.categoryId))
  if (!category) throw new CostModelError(400, 'That category no longer exists')

  let subCategoryName: string | null = null
  if (body.subCategoryId !== null) {
    const [sub] = await db.select().from(costSubCategories).where(eq(costSubCategories.id, body.subCategoryId))
    if (!sub || sub.categoryId !== category.id) throw new CostModelError(400, 'That sub-category doesn\'t belong to the chosen category')
    subCategoryName = sub.name
  }

  const capturedAt = new Date().toISOString()
  const snapshot = buildCostFactorsSnapshot(factors, body.originPortId, capturedAt)
  if (!snapshot) throw new CostModelError(400, 'Choose a ship-from port')

  if (body.duplicatedFromId) {
    const [source] = await db.select({ id: costModels.id }).from(costModels).where(eq(costModels.id, body.duplicatedFromId))
    if (!source) body.duplicatedFromId = null // original deleted meanwhile - still save the copy
  }

  const baseName = costModelName({
    category: category.name,
    subCategory: subCategoryName,
    supplier: supplierName,
    savedDate: todayMY()
  })

  const rows = body.rows.filter(costRowHasContent)

  return db.transaction(async (tx) => {
    // Same-day copies get "(2)", "(3)"... The lock makes two saves of the same
    // name at the same moment take turns, so they can't both pick "(2)".
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${baseName}))`)
    const taken = await tx
      .select({ name: costModels.name })
      .from(costModels)
      .where(or(eq(costModels.name, baseName), like(costModels.name, `${baseName.replace(/[\\%_]/g, m => `\\${m}`)} (%)`)))
    const name = nextCostModelName(baseName, taken.map(t => t.name))

    const [model] = await tx
      .insert(costModels)
      .values({
        name,
        supplierName,
        categoryId: category.id,
        subCategoryId: body.subCategoryId,
        originPortId: body.originPortId,
        containerBasis: body.containerBasis,
        factorsSnapshot: snapshot,
        notes: body.notes?.trim() || null,
        duplicatedFromId: body.duplicatedFromId ?? null,
        createdBy: userId
      })
      .returning({ id: costModels.id, name: costModels.name })

    await tx.insert(costModelRows).values(rows.map((r, i) => ({
      modelId: model!.id,
      sortOrder: i,
      productNo: r.productNo?.trim() || null,
      description: r.description?.trim() || null,
      cartonLengthCm: strOrNull(r.carton.lengthCm),
      cartonWidthCm: strOrNull(r.carton.widthCm),
      cartonHeightCm: strOrNull(r.carton.heightCm),
      cartonQty: r.carton.qtyInside,
      outerLengthCm: strOrNull(r.outer.lengthCm),
      outerWidthCm: strOrNull(r.outer.widthCm),
      outerHeightCm: strOrNull(r.outer.heightCm),
      outerQty: r.outer.qtyInside,
      palletLengthCm: strOrNull(r.pallet.lengthCm),
      palletWidthCm: strOrNull(r.pallet.widthCm),
      palletHeightCm: strOrNull(r.pallet.heightCm),
      palletQty: r.pallet.qtyInside,
      fobCurrency: r.fobCurrency,
      fobPrice: strOrNull(r.fobPrice),
      toolingCost: strOrNull(r.toolingCost),
      dutyPercent: strOrNull(r.dutyPercent),
      buyerBuyPrice: strOrNull(r.buyerBuyPrice),
      rrpIncGst: strOrNull(r.rrpIncGst),
      results: calculateCostRow(r, snapshot, body.containerBasis)
    })))

    return model!
  })
}

/* ------------------------------------------------------------------ */
/* List / search                                                       */
/* ------------------------------------------------------------------ */

export const COST_MODELS_PAGE_SIZE = 25

/** Newest first. `q` matches name, supplier, category, sub-category, or any product no./description inside. */
export async function listCostModels(db: Db, q: string, page: number): Promise<CostModelListResponse> {
  const term = q.trim()
  const pattern = `%${term.replace(/[\\%_]/g, m => `\\${m}`)}%`
  const where = term
    ? or(
        ilike(costModels.name, pattern),
        ilike(costModels.supplierName, pattern),
        ilike(costCategories.name, pattern),
        ilike(costSubCategories.name, pattern),
        exists(
          db.select({ one: sql`1` })
            .from(costModelRows)
            .where(and(
              eq(costModelRows.modelId, costModels.id),
              or(ilike(costModelRows.productNo, pattern), ilike(costModelRows.description, pattern))
            ))
        )
      )
    : undefined

  const rowCount = db
    .select({ modelId: costModelRows.modelId, n: count().as('n') })
    .from(costModelRows)
    .groupBy(costModelRows.modelId)
    .as('row_count')

  const base = db
    .select({
      id: costModels.id,
      name: costModels.name,
      supplierName: costModels.supplierName,
      categoryName: costCategories.name,
      subCategoryName: costSubCategories.name,
      originCode: costPorts.code,
      containerBasis: costModels.containerBasis,
      rowCount: rowCount.n,
      createdAt: costModels.createdAt,
      createdByName: profiles.fullName,
      createdByEmail: profiles.email
    })
    .from(costModels)
    .innerJoin(costCategories, eq(costCategories.id, costModels.categoryId))
    .leftJoin(costSubCategories, eq(costSubCategories.id, costModels.subCategoryId))
    .innerJoin(costPorts, eq(costPorts.id, costModels.originPortId))
    .leftJoin(profiles, eq(profiles.id, costModels.createdBy))
    .leftJoin(rowCount, eq(rowCount.modelId, costModels.id))
    .where(where)

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(costModels)
    .innerJoin(costCategories, eq(costCategories.id, costModels.categoryId))
    .leftJoin(costSubCategories, eq(costSubCategories.id, costModels.subCategoryId))
    .where(where)

  const safePage = Math.max(1, Math.floor(page) || 1)
  const rows = await base
    .orderBy(desc(costModels.createdAt), desc(costModels.id))
    .limit(COST_MODELS_PAGE_SIZE)
    .offset((safePage - 1) * COST_MODELS_PAGE_SIZE)

  const items: CostModelListItem[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    supplierName: r.supplierName,
    categoryName: r.categoryName,
    subCategoryName: r.subCategoryName,
    originCode: r.originCode,
    containerBasis: r.containerBasis,
    rowCount: Number(r.rowCount ?? 0),
    createdAt: r.createdAt.toISOString(),
    createdByName: personName(r.createdByName, r.createdByEmail)
  }))

  return { items, total: Number(total), page: safePage, pageSize: COST_MODELS_PAGE_SIZE }
}

/* ------------------------------------------------------------------ */
/* Saved row -> the inputs the form and maths use                      */
/* ------------------------------------------------------------------ */

const level = (l: string | null, w: string | null, h: string | null, q: number | null): PackLevelInput =>
  ({ lengthCm: numOrNull(l), widthCm: numOrNull(w), heightCm: numOrNull(h), qtyInside: q })

export function rowInputFromDb(r: typeof costModelRows.$inferSelect): CostModelRowInput {
  return {
    productNo: r.productNo,
    description: r.description,
    carton: level(r.cartonLengthCm, r.cartonWidthCm, r.cartonHeightCm, r.cartonQty),
    outer: level(r.outerLengthCm, r.outerWidthCm, r.outerHeightCm, r.outerQty),
    pallet: level(r.palletLengthCm, r.palletWidthCm, r.palletHeightCm, r.palletQty),
    fobCurrency: r.fobCurrency,
    fobPrice: numOrNull(r.fobPrice),
    toolingCost: numOrNull(r.toolingCost),
    dutyPercent: numOrNull(r.dutyPercent),
    buyerBuyPrice: numOrNull(r.buyerBuyPrice),
    rrpIncGst: numOrNull(r.rrpIncGst)
  }
}

/* ------------------------------------------------------------------ */
/* Product look-up (Step 11.8d)                                        */
/* ------------------------------------------------------------------ */

export const COST_PRODUCT_SUGGESTIONS = 10

/**
 * Previously costed products whose product no. contains `q` (ignoring case):
 * the MOST RECENT saved version of each, product nos. starting with `q` first.
 * Product nos. are unique across RHG, so the number alone identifies a product.
 */
export async function findCostProducts(db: Db, q: string): Promise<CostProductSuggestion[]> {
  const term = q.trim().toLowerCase()
  if (!term) return []
  const pattern = `%${term.replace(/[\\%_]/g, m => `\\${m}`)}%`

  const latest = await db
    .selectDistinctOn([sql`lower(${costModelRows.productNo})`], {
      row: costModelRows,
      modelId: costModels.id,
      modelName: costModels.name,
      supplierName: costModels.supplierName,
      savedAt: costModels.createdAt
    })
    .from(costModelRows)
    .innerJoin(costModels, eq(costModels.id, costModelRows.modelId))
    .where(ilike(costModelRows.productNo, pattern))
    .orderBy(sql`lower(${costModelRows.productNo})`, desc(costModels.createdAt), desc(costModelRows.id))
    .limit(200)

  return latest
    .map(l => ({
      productNo: l.row.productNo!,
      description: l.row.description,
      input: rowInputFromDb(l.row),
      modelId: l.modelId,
      modelName: l.modelName,
      supplierName: l.supplierName,
      savedAt: l.savedAt.toISOString()
    }))
    .sort((a, b) => {
      const aStarts = a.productNo.toLowerCase().startsWith(term) ? 0 : 1
      const bStarts = b.productNo.toLowerCase().startsWith(term) ? 0 : 1
      return aStarts - bStarts || a.productNo.localeCompare(b.productNo, 'en', { sensitivity: 'base', numeric: true })
    })
    .slice(0, COST_PRODUCT_SUGGESTIONS)
}

/* ------------------------------------------------------------------ */
/* Open one                                                            */
/* ------------------------------------------------------------------ */

export async function getCostModel(db: Db, id: number, canDelete: boolean): Promise<CostModelDetail | null> {
  const source = alias(costModels, 'source_model')
  const [m] = await db
    .select({
      model: costModels,
      categoryName: costCategories.name,
      subCategoryName: costSubCategories.name,
      createdByName: profiles.fullName,
      createdByEmail: profiles.email,
      sourceId: source.id,
      sourceName: source.name
    })
    .from(costModels)
    .innerJoin(costCategories, eq(costCategories.id, costModels.categoryId))
    .leftJoin(costSubCategories, eq(costSubCategories.id, costModels.subCategoryId))
    .leftJoin(profiles, eq(profiles.id, costModels.createdBy))
    .leftJoin(source, eq(source.id, costModels.duplicatedFromId))
    .where(eq(costModels.id, id))
  if (!m) return null

  const rows = await db
    .select()
    .from(costModelRows)
    .where(eq(costModelRows.modelId, id))
    .orderBy(costModelRows.sortOrder, costModelRows.id)

  return {
    id: m.model.id,
    name: m.model.name,
    supplierName: m.model.supplierName,
    categoryId: m.model.categoryId,
    categoryName: m.categoryName,
    subCategoryId: m.model.subCategoryId,
    subCategoryName: m.subCategoryName,
    originPortId: m.model.originPortId,
    containerBasis: m.model.containerBasis,
    notes: m.model.notes,
    duplicatedFrom: m.sourceId ? { id: m.sourceId, name: m.sourceName! } : null,
    factorsSnapshot: m.model.factorsSnapshot,
    rows: rows.map(r => ({ id: r.id, ...rowInputFromDb(r), results: r.results })),
    createdAt: m.model.createdAt.toISOString(),
    createdByName: personName(m.createdByName, m.createdByEmail),
    canDelete
  }
}
