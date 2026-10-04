import { and, asc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import { costCategories, costSubCategories, pimCategories, pimPackaging, pimProducts } from '~~/server/db/schema'
import { createPimCategory, createPimProduct, PimError } from '~~/server/utils/pim'
import type { PimProductBody } from '~~/server/utils/pimBodies'
import type { CostModelRowInput, CostPimSyncResult, CostProductPim } from '~~/shared/types/costModelling'
import { costRowHasContent } from '~~/shared/utils/costModel'
import { costProductNoKey, pimDraftsFromCostRows, type PimDraft } from '~~/shared/utils/costPimLink'

/**
 * Cost Modelling <-> PIM link (Step 20.3). The pure rules are in
 * shared/utils/costPimLink.ts; this is the database side: finding PIM
 * products for the look-up, and adding the missing ones when a model is saved.
 * Cost Modelling users need no PIM role for this (Navin's decision); the PIM
 * history records who created the product and from which model.
 */

type Db = ReturnType<typeof useDb>

/** PIM products whose number matches an ILIKE pattern, with their category names and packaging. */
export async function findPimProductsForCost(db: Db, pattern: string): Promise<CostProductPim[]> {
  const products = await db
    .select()
    .from(pimProducts)
    .where(ilike(pimProducts.productNo, pattern))
    .orderBy(asc(pimProducts.productNo))
    .limit(50)
  if (!products.length) return []

  const categoryIds = [...new Set(products.flatMap(p => [p.categoryId, p.subCategoryId]).filter((id): id is number => id !== null))]
  const [categories, packaging] = await Promise.all([
    categoryIds.length
      ? db.select({ id: pimCategories.id, name: pimCategories.name }).from(pimCategories).where(inArray(pimCategories.id, categoryIds))
      : Promise.resolve([] as { id: number, name: string }[]),
    db.select().from(pimPackaging).where(inArray(pimPackaging.productId, products.map(p => p.id)))
  ])
  const categoryName = (id: number | null) => (id === null ? null : (categories.find(c => c.id === id)?.name ?? null))

  return products.map(p => ({
    id: p.id,
    productNo: p.productNo,
    name: p.name,
    categoryName: categoryName(p.categoryId),
    subCategoryName: categoryName(p.subCategoryId),
    packaging: packaging
      .filter(x => x.productId === p.id)
      .map(x => ({ level: x.level, lengthCm: x.lengthCm, widthCm: x.widthCm, heightCm: x.heightCm, qtyInside: x.qtyInside }))
  }))
}

/**
 * The PIM category called `name` (ignoring case) at this level, created if it
 * doesn't exist. Null when it exists but has been switched off in the PIM (a
 * product can't be put in a switched-off category).
 */
async function pimCategoryIdByName(db: Db, name: string, parentId: number | null): Promise<number | null> {
  const find = async () => {
    const [found] = await db
      .select({ id: pimCategories.id, active: pimCategories.active })
      .from(pimCategories)
      .where(and(
        sql`lower(${pimCategories.name}) = lower(${name.trim()})`,
        parentId === null ? isNull(pimCategories.parentId) : eq(pimCategories.parentId, parentId)
      ))
    return found
  }
  const existing = await find()
  if (existing) return existing.active ? existing.id : null
  try {
    return (await createPimCategory(db, name, parentId)).id
  } catch (err) {
    // Someone created it a moment ago: use theirs.
    if (err instanceof PimError && err.status === 409) {
      const again = await find()
      return again?.active ? again.id : null
    }
    throw err
  }
}

function pimBodyFromDraft(draft: PimDraft, categoryId: number | null, subCategoryId: number | null): PimProductBody {
  const packaging: PimProductBody['packaging'] = {}
  for (const p of draft.packaging) {
    packaging[p.level] = { lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, weightKg: null, qtyInside: p.qtyInside }
  }
  return {
    productNo: draft.productNo,
    name: draft.name,
    status: 'draft',
    brand: null,
    categoryId,
    subCategoryId: categoryId ? subCategoryId : null,
    shortDescription: null,
    longDescription: null,
    barcode: null,
    rrp: null,
    suppliers: [{ name: draft.supplierName, supplierCode: null, isPrimary: true }],
    packaging,
    attributes: {}
  }
}

/**
 * After a cost model is saved: every product number on it that the PIM doesn't
 * know yet becomes a Draft product there (with its supplier, category,
 * sub-category and packaging). Products the PIM already has are left alone -
 * it is never changed from Cost Modelling. Never throws: a product that can't
 * be added is reported in `skipped`, and the cost model stays saved.
 */
export async function createMissingPimProducts(
  db: Db,
  userId: string,
  model: { name: string, supplierName: string, categoryId: number, subCategoryId: number | null },
  rows: CostModelRowInput[]
): Promise<CostPimSyncResult> {
  const result: CostPimSyncResult = { created: [], skipped: [] }
  try {
    const [category] = await db.select({ name: costCategories.name }).from(costCategories).where(eq(costCategories.id, model.categoryId))
    const [sub] = model.subCategoryId
      ? await db.select({ name: costSubCategories.name }).from(costSubCategories).where(eq(costSubCategories.id, model.subCategoryId))
      : []
    if (!category) return result

    const drafts = pimDraftsFromCostRows(rows.filter(costRowHasContent), {
      supplierName: model.supplierName,
      categoryName: category.name,
      subCategoryName: sub?.name ?? null
    })
    if (!drafts.length) return result

    const known = await db
      .select({ productNo: pimProducts.productNo })
      .from(pimProducts)
      .where(inArray(sql`lower(${pimProducts.productNo})`, drafts.map(d => costProductNoKey(d.productNo))))
    const knownKeys = new Set(known.map(k => costProductNoKey(k.productNo)))
    const missing = drafts.filter(d => !knownKeys.has(costProductNoKey(d.productNo)))
    if (!missing.length) return result

    // The categories are the same for every product in the model, so work them out once.
    let categoryId: number | null = null
    let subCategoryId: number | null = null
    try {
      categoryId = await pimCategoryIdByName(db, category.name, null)
      if (categoryId && sub) subCategoryId = await pimCategoryIdByName(db, sub.name, categoryId)
    } catch {
      categoryId = null
      subCategoryId = null
    }

    for (const draft of missing) {
      try {
        await createPimProduct(db, userId, pimBodyFromDraft(draft, categoryId, subCategoryId), `Created from cost model "${model.name}"`)
        result.created.push(draft.productNo)
      } catch (err) {
        result.skipped.push({
          productNo: draft.productNo,
          reason: err instanceof PimError ? err.message : 'Something went wrong adding it to the PIM.'
        })
      }
    }
  } catch {
    result.skipped.push({ productNo: '', reason: 'The PIM could not be updated. The cost model itself was saved.' })
  }
  return result
}
