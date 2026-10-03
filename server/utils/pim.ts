import type { H3Event } from 'h3'
import { and, asc, desc, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import {
  pimAttributeValues,
  pimAttributes,
  pimCategories,
  pimFiles,
  pimHistory,
  pimPackaging,
  pimProductSuppliers,
  pimProducts,
  profiles
} from '~~/server/db/schema'
import { todayISO } from '~~/server/utils/leaveBalance'
import { buildObjectKey, deleteObject, getDownloadUrl, getUploadUrl, headObjectSize } from '~~/server/utils/r2'
import type { PimProductBody } from '~~/server/utils/pimBodies'
import type {
  PimAttributeItem,
  PimCategoryItem,
  PimFileItem,
  PimHistoryItem,
  PimListItem,
  PimListResponse,
  PimPackagingItem,
  PimPackagingLevelKey,
  PimProductView
} from '~~/shared/types/pim'
import { projectFileContentType, tidyProjectFileName } from '~~/shared/utils/projectFiles'
import {
  buildPimCsv,
  checkPimAttributeValue,
  describePimChange,
  isPimStatus,
  normalisePimSuppliers,
  pimAttributeDefProblem,
  pimBarcodeProblem,
  pimChanges,
  pimCompleteness,
  pimFileProblem,
  pimMeasureProblem,
  pimMoneyProblem,
  pimNameProblem,
  pimNextImageIsMain,
  pimOptionalTextProblem,
  pimProductNoKey,
  pimProductNoProblem,
  pimQuantityProblem,
  pimSuppliersProblem,
  tidyPimText,
  PIM_LONG_DESC_MAX,
  PIM_REQUIRABLE_FIELDS,
  PIM_SHORT_DESC_MAX,
  PIM_SHORT_TEXT_MAX,
  type PimAttributeType,
  type PimFileKind,
  type PimImportRow,
  type PimRequirableField,
  type PimStatus,
  type PimSupplier
} from '~~/shared/utils/pimRules'

type Db = ReturnType<typeof useDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Runner = Db | Tx

export const PIM_TOOL_ID = 'pim'
/** Every role on the tool. */
export const PIM_ROLES = ['viewer', 'editor', 'admin']
export const PIM_STORAGE_FOLDER = 'pim'
export const PIM_PAGE_SIZE = 50
export const PIM_MAX_FILES = 60
const FILE_LINK_SECONDS = 900
const PACKAGING_LEVELS: PimPackagingLevelKey[] = ['carton', 'outer', 'pallet']
const PACKAGING_LABELS: Record<PimPackagingLevelKey, string> = { carton: 'Carton', outer: 'Outer', pallet: 'Pallet' }

export class PimError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Turn a PimError into an HTTP error; anything else is rethrown. */
export function pimHttpError(err: unknown): never {
  if (err instanceof PimError) throw createError({ statusCode: err.status, statusMessage: err.message })
  throw err
}

export function parsePimId(event: H3Event, param = 'id', what = 'product'): number {
  const id = Number(getRouterParam(event, param))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: `Invalid ${what}.` })
  return id
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string, cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export const canEditPim = (roles: string[]) => roles.includes('editor') || roles.includes('admin') || roles.includes('owner')
export const isPimAdmin = (roles: string[]) => roles.includes('admin') || roles.includes('owner')

export function requirePimEditor(roles: string[]) {
  if (!canEditPim(roles)) throw createError({ statusCode: 403, statusMessage: 'Only editors and admins can change products.' })
}

const multilineOrNull = (v: string | null | undefined) => (v ?? '').trim() || null
const escapeLike = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)

// ---------------------------------------------------------------- Categories

/** Every category (with sub-categories, attributes and product counts), A-Z. Inactive ones are included. */
export async function listPimCategories(db: Runner): Promise<PimCategoryItem[]> {
  const [cats, attrs, counts] = await Promise.all([
    db.select().from(pimCategories).orderBy(asc(sql`lower(${pimCategories.name})`)),
    db.select().from(pimAttributes).orderBy(asc(pimAttributes.sortOrder), asc(pimAttributes.id)),
    db
      .select({ categoryId: pimProducts.categoryId, n: sql<number>`count(*)::int` })
      .from(pimProducts)
      .where(isNotNull(pimProducts.categoryId))
      .groupBy(pimProducts.categoryId)
  ])
  const countOf = new Map(counts.map(c => [c.categoryId, c.n]))
  return cats
    .filter(c => c.parentId === null)
    .map(c => ({
      id: c.id,
      name: c.name,
      active: c.active,
      requiredFields: c.requiredFields,
      productCount: countOf.get(c.id) ?? 0,
      subCategories: cats.filter(s => s.parentId === c.id).map(s => ({ id: s.id, name: s.name, active: s.active })),
      attributes: attrs.filter(a => a.categoryId === c.id).map(attributeItem)
    }))
}

function attributeItem(a: typeof pimAttributes.$inferSelect): PimAttributeItem {
  return { id: a.id, categoryId: a.categoryId, name: a.name, type: a.type, options: a.options, required: a.required, active: a.active }
}

export async function createPimCategory(db: Db, name: string, parentId: number | null | undefined) {
  const problem = pimNameProblem(name, 'Category name', PIM_SHORT_TEXT_MAX)
  if (problem) throw new PimError(400, problem)
  if (parentId) {
    const [parent] = await db.select({ parentId: pimCategories.parentId }).from(pimCategories).where(eq(pimCategories.id, parentId))
    if (!parent) throw new PimError(404, 'That category no longer exists.')
    if (parent.parentId !== null) throw new PimError(400, 'Sub-categories can\'t have sub-categories of their own.')
  }
  try {
    const [row] = await db
      .insert(pimCategories)
      .values({ name: tidyPimText(name), parentId: parentId ?? null })
      .returning({ id: pimCategories.id })
    return row!
  } catch (err) {
    if (isUniqueViolation(err)) throw new PimError(409, `There is already a ${parentId ? 'sub-category' : 'category'} called "${tidyPimText(name)}" here.`)
    throw err
  }
}

export async function updatePimCategory(
  db: Db,
  id: number,
  body: { name: string, active: boolean, requiredFields?: string[] }
) {
  const problem = pimNameProblem(body.name, 'Category name', PIM_SHORT_TEXT_MAX)
  if (problem) throw new PimError(400, problem)
  const [cat] = await db.select().from(pimCategories).where(eq(pimCategories.id, id))
  if (!cat) throw new PimError(404, 'That category no longer exists.')
  const values: Partial<typeof pimCategories.$inferInsert> = { name: tidyPimText(body.name), active: body.active }
  if (body.requiredFields) {
    if (cat.parentId !== null) throw new PimError(400, 'Required fields are set on the category, not a sub-category.')
    const known = Object.keys(PIM_REQUIRABLE_FIELDS)
    const bad = body.requiredFields.find(f => !known.includes(f))
    if (bad) throw new PimError(400, `"${bad}" isn't a field a category can require.`)
    values.requiredFields = [...new Set(body.requiredFields)]
  }
  try {
    await db.update(pimCategories).set(values).where(eq(pimCategories.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) throw new PimError(409, `There is already a ${cat.parentId ? 'sub-category' : 'category'} called "${tidyPimText(body.name)}" here.`)
    throw err
  }
}

/** Only a category (or sub-category) that no product uses can be deleted. */
export async function deletePimCategory(db: Db, id: number) {
  const [cat] = await db.select().from(pimCategories).where(eq(pimCategories.id, id))
  if (!cat) throw new PimError(404, 'That category no longer exists.')
  const ids = [id, ...(await db.select({ id: pimCategories.id }).from(pimCategories).where(eq(pimCategories.parentId, id))).map(r => r.id)]
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pimProducts)
    .where(or(inArray(pimProducts.categoryId, ids), inArray(pimProducts.subCategoryId, ids)))
  if (used!.n > 0) {
    throw new PimError(409, `${used!.n} product${used!.n === 1 ? ' uses' : 's use'} this category. Switch it off instead of deleting it.`)
  }
  await db.delete(pimCategories).where(eq(pimCategories.id, id))
}

// ---------------------------------------------------------------- Attributes

function attributeProblem(body: { name: string, type: string, options?: string[] | null }): string {
  return pimAttributeDefProblem({ name: body.name, type: body.type, options: body.options })
}

export async function createPimAttribute(
  db: Db,
  body: { categoryId: number, name: string, type: string, options?: string[] | null, required: boolean }
) {
  const problem = attributeProblem(body)
  if (problem) throw new PimError(400, problem)
  const [cat] = await db.select({ parentId: pimCategories.parentId }).from(pimCategories).where(eq(pimCategories.id, body.categoryId))
  if (!cat) throw new PimError(404, 'That category no longer exists.')
  if (cat.parentId !== null) throw new PimError(400, 'Attributes belong to a category, not a sub-category.')
  const [last] = await db
    .select({ n: sql<number>`coalesce(max(${pimAttributes.sortOrder}), 0)::int` })
    .from(pimAttributes)
    .where(eq(pimAttributes.categoryId, body.categoryId))
  try {
    const [row] = await db
      .insert(pimAttributes)
      .values({
        categoryId: body.categoryId,
        name: tidyPimText(body.name),
        type: body.type as PimAttributeType,
        options: body.type === 'list' ? (body.options ?? []).map(tidyPimText).filter(Boolean) : null,
        required: body.required,
        sortOrder: last!.n + 1
      })
      .returning({ id: pimAttributes.id })
    return row!
  } catch (err) {
    if (isUniqueViolation(err)) throw new PimError(409, `This category already has an attribute called "${tidyPimText(body.name)}".`)
    throw err
  }
}

/** The type can't change once created (values already saved would no longer fit). */
export async function updatePimAttribute(
  db: Db,
  id: number,
  body: { name: string, options?: string[] | null, required: boolean, active: boolean }
) {
  const [attr] = await db.select().from(pimAttributes).where(eq(pimAttributes.id, id))
  if (!attr) throw new PimError(404, 'That attribute no longer exists.')
  const problem = attributeProblem({ name: body.name, type: attr.type, options: body.options })
  if (problem) throw new PimError(400, problem)
  try {
    await db
      .update(pimAttributes)
      .set({
        name: tidyPimText(body.name),
        options: attr.type === 'list' ? (body.options ?? []).map(tidyPimText).filter(Boolean) : null,
        required: body.required,
        active: body.active
      })
      .where(eq(pimAttributes.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) throw new PimError(409, `This category already has an attribute called "${tidyPimText(body.name)}".`)
    throw err
  }
}

/** Only an attribute no product has a value for can be deleted; otherwise switch it off. */
export async function deletePimAttribute(db: Db, id: number) {
  const [attr] = await db.select({ id: pimAttributes.id }).from(pimAttributes).where(eq(pimAttributes.id, id))
  if (!attr) throw new PimError(404, 'That attribute no longer exists.')
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pimAttributeValues)
    .where(eq(pimAttributeValues.attributeId, id))
  if (used!.n > 0) {
    throw new PimError(409, `${used!.n} product${used!.n === 1 ? ' has' : 's have'} a value for this attribute. Switch it off instead of deleting it.`)
  }
  await db.delete(pimAttributes).where(eq(pimAttributes.id, id))
}

// ------------------------------------------------------------ Product data

/** A product's content in one plain shape; used for loading, validating, comparing and saving. */
export interface PimProductData {
  productNo: string
  name: string
  status: PimStatus
  brand: string | null
  categoryId: number | null
  subCategoryId: number | null
  shortDescription: string | null
  longDescription: string | null
  barcode: string | null
  rrp: string | null
  suppliers: PimSupplier[]
  packaging: PimPackagingItem[]
  /** Attribute id -> stored value. */
  attributes: Record<number, string>
}

interface NameContext {
  categoryNames: Map<number, string>
  attributeNames: Map<number, string>
}

async function loadNameContext(db: Runner): Promise<NameContext> {
  const [cats, attrs] = await Promise.all([
    db.select({ id: pimCategories.id, name: pimCategories.name }).from(pimCategories),
    db.select({ id: pimAttributes.id, name: pimAttributes.name }).from(pimAttributes)
  ])
  return {
    categoryNames: new Map(cats.map(c => [c.id, c.name])),
    attributeNames: new Map(attrs.map(a => [a.id, a.name]))
  }
}

const fixed = (v: string | number | null | undefined, places: number): string | null =>
  v === null || v === undefined || String(v).trim() === '' ? null : Number(v).toFixed(places)

async function loadProductData(db: Runner, id: number): Promise<{ row: typeof pimProducts.$inferSelect, data: PimProductData } | null> {
  const [row] = await db.select().from(pimProducts).where(eq(pimProducts.id, id))
  if (!row) return null
  const [suppliers, packaging, values] = await Promise.all([
    db.select().from(pimProductSuppliers).where(eq(pimProductSuppliers.productId, id)).orderBy(asc(pimProductSuppliers.sortOrder), asc(pimProductSuppliers.id)),
    db.select().from(pimPackaging).where(eq(pimPackaging.productId, id)),
    db.select().from(pimAttributeValues).where(eq(pimAttributeValues.productId, id))
  ])
  return {
    row,
    data: {
      productNo: row.productNo,
      name: row.name,
      status: row.status,
      brand: row.brand,
      categoryId: row.categoryId,
      subCategoryId: row.subCategoryId,
      shortDescription: row.shortDescription,
      longDescription: row.longDescription,
      barcode: row.barcode,
      rrp: row.rrp,
      suppliers: suppliers.map(s => ({ name: s.name, supplierCode: s.supplierCode, isPrimary: s.isPrimary })),
      packaging: PACKAGING_LEVELS.flatMap((level) => {
        const p = packaging.find(x => x.level === level)
        return p ? [{ level, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, weightKg: p.weightKg, qtyInside: p.qtyInside }] : []
      }),
      attributes: Object.fromEntries(values.map(v => [v.attributeId, v.value]))
    }
  }
}

function packagingText(p: PimPackagingItem): string {
  const size = [p.lengthCm, p.widthCm, p.heightCm].some(v => v !== null)
    ? `${[p.lengthCm, p.widthCm, p.heightCm].map(v => (v === null ? '?' : Number(v))).join(' x ')} cm`
    : ''
  return [size, p.weightKg !== null ? `${Number(p.weightKg)} kg` : '', p.qtyInside !== null ? `qty ${p.qtyInside}` : ''].filter(Boolean).join(', ')
}

/** Labelled plain-text view of a product, for comparing before / after in the history. */
function snapshotOf(data: PimProductData, names: NameContext): Record<string, string> {
  const snap: Record<string, string> = {
    'Product number': data.productNo,
    'Name': data.name,
    'Status': data.status,
    'Brand': data.brand ?? '',
    'Category': data.categoryId ? (names.categoryNames.get(data.categoryId) ?? '') : '',
    'Sub-category': data.subCategoryId ? (names.categoryNames.get(data.subCategoryId) ?? '') : '',
    'Short description': data.shortDescription ?? '',
    'Long description': data.longDescription ?? '',
    'Barcode': data.barcode ?? '',
    'RRP': data.rrp === null ? '' : String(Number(data.rrp)),
    'Suppliers': data.suppliers.map(s => `${s.name}${s.supplierCode ? ` (${s.supplierCode})` : ''}${s.isPrimary ? ' *' : ''}`).join('; ')
  }
  for (const level of PACKAGING_LEVELS) {
    const p = data.packaging.find(x => x.level === level)
    snap[PACKAGING_LABELS[level]] = p ? packagingText(p) : ''
  }
  for (const [id, value] of Object.entries(data.attributes)) {
    snap[names.attributeNames.get(Number(id)) ?? `Attribute ${id}`] = value
  }
  return snap
}

/** What changed between two versions, labelled. Attributes missing from `after` count as cleared. */
function diffProducts(before: PimProductData, after: PimProductData, names: NameContext) {
  const b = snapshotOf(before, names)
  const a = snapshotOf(after, names)
  for (const key of Object.keys(b)) if (!(key in a)) a[key] = ''
  return pimChanges(b, a)
}

// ---------------------------------------------------------------- Validation

/** Checks a product body and returns it tidied, or throws a plain 400. `current` allows keeping a now-switched-off category. */
export async function cleanPimProduct(
  db: Runner,
  body: PimProductBody,
  current?: { categoryId: number | null, subCategoryId: number | null }
): Promise<PimProductData> {
  const fail = (msg: string): never => {
    throw new PimError(400, msg)
  }
  const productNo = tidyPimText(body.productNo)
  const name = tidyPimText(body.name)
  const noProblem = pimProductNoProblem(productNo)
  if (noProblem) fail(noProblem)
  const nameProblem = pimNameProblem(name)
  if (nameProblem) fail(nameProblem)
  if (!isPimStatus(body.status)) fail('Pick a status')
  const brand = tidyPimText(body.brand)
  for (const p of [
    pimOptionalTextProblem(brand, 'Brand', PIM_SHORT_TEXT_MAX),
    pimOptionalTextProblem(body.shortDescription, 'Short description', PIM_SHORT_DESC_MAX),
    pimOptionalTextProblem(body.longDescription, 'Long description', PIM_LONG_DESC_MAX),
    pimBarcodeProblem(body.barcode),
    pimMoneyProblem(body.rrp, 'RRP')
  ]) if (p) fail(p)
  const suppliersProblem = pimSuppliersProblem(body.suppliers)
  if (suppliersProblem) fail(suppliersProblem)

  // Category and sub-category
  const categoryId = body.categoryId ?? null
  let subCategoryId = body.subCategoryId ?? null
  if (!categoryId && subCategoryId) fail('A sub-category needs a category')
  if (!categoryId) subCategoryId = null
  if (categoryId) {
    const rows = await db
      .select()
      .from(pimCategories)
      .where(inArray(pimCategories.id, subCategoryId ? [categoryId, subCategoryId] : [categoryId]))
    const cat = rows.find(r => r.id === categoryId)
    if (!cat || cat.parentId !== null) fail('Pick a category from the list')
    if (!cat!.active && current?.categoryId !== categoryId) fail(`The category "${cat!.name}" is switched off`)
    if (subCategoryId) {
      const sub = rows.find(r => r.id === subCategoryId)
      if (!sub || sub.parentId !== categoryId) fail('That sub-category doesn\'t belong to the chosen category')
      if (!sub!.active && current?.subCategoryId !== subCategoryId) fail(`The sub-category "${sub!.name}" is switched off`)
    }
  }

  // Packaging
  const packaging: PimPackagingItem[] = []
  for (const level of PACKAGING_LEVELS) {
    const p = body.packaging[level]
    if (!p) continue
    const label = PACKAGING_LABELS[level]
    for (const [raw, what] of [[p.lengthCm, 'length'], [p.widthCm, 'width'], [p.heightCm, 'height'], [p.weightKg, 'weight']] as const) {
      const problem = pimMeasureProblem(raw, `${label} ${what}`)
      if (problem) fail(problem)
    }
    const qtyProblem = pimQuantityProblem(p.qtyInside, `${label} quantity`)
    if (qtyProblem) fail(qtyProblem)
    const item: PimPackagingItem = {
      level,
      lengthCm: fixed(p.lengthCm, 2),
      widthCm: fixed(p.widthCm, 2),
      heightCm: fixed(p.heightCm, 2),
      weightKg: fixed(p.weightKg, 3),
      qtyInside: fixed(p.qtyInside, 0) === null ? null : Number(p.qtyInside)
    }
    if ([item.lengthCm, item.widthCm, item.heightCm, item.weightKg, item.qtyInside].some(v => v !== null)) packaging.push(item)
  }

  // Attributes (only those of the chosen category count; others are dropped)
  const attributes: Record<number, string> = {}
  if (categoryId) {
    const defs = await db.select().from(pimAttributes).where(and(eq(pimAttributes.categoryId, categoryId)))
    for (const def of defs) {
      if (!(String(def.id) in body.attributes)) continue
      const { value, problem } = checkPimAttributeValue(def, body.attributes[String(def.id)])
      if (problem) fail(problem)
      if (value !== null) attributes[def.id] = value
    }
  }

  return {
    productNo,
    name,
    status: body.status,
    brand: brand || null,
    categoryId,
    subCategoryId,
    shortDescription: multilineOrNull(body.shortDescription),
    longDescription: multilineOrNull(body.longDescription),
    barcode: (body.barcode ?? '').replace(/\s+/g, '') || null,
    rrp: fixed(body.rrp, 2),
    suppliers: normalisePimSuppliers(body.suppliers),
    packaging,
    attributes
  }
}

// ------------------------------------------------------------------- Saving

async function writeParts(tx: Tx, productId: number, data: PimProductData) {
  await tx.delete(pimProductSuppliers).where(eq(pimProductSuppliers.productId, productId))
  if (data.suppliers.length) {
    await tx.insert(pimProductSuppliers).values(
      data.suppliers.map((s, i) => ({ productId, name: s.name, supplierCode: s.supplierCode, isPrimary: s.isPrimary, sortOrder: i }))
    )
  }
  await tx.delete(pimPackaging).where(eq(pimPackaging.productId, productId))
  if (data.packaging.length) {
    await tx.insert(pimPackaging).values(data.packaging.map(p => ({ productId, ...p })))
  }
  await tx.delete(pimAttributeValues).where(eq(pimAttributeValues.productId, productId))
  const entries = Object.entries(data.attributes)
  if (entries.length) {
    await tx.insert(pimAttributeValues).values(entries.map(([attributeId, value]) => ({ productId, attributeId: Number(attributeId), value })))
  }
}

function productColumns(data: PimProductData) {
  return {
    productNo: data.productNo,
    name: data.name,
    status: data.status,
    brand: data.brand,
    categoryId: data.categoryId,
    subCategoryId: data.subCategoryId,
    shortDescription: data.shortDescription,
    longDescription: data.longDescription,
    barcode: data.barcode,
    rrp: data.rrp
  }
}

const noProductNoMessage = (productNo: string) => `The product number "${productNo}" is already used by another product.`

async function insertProduct(tx: Tx, userId: string, data: PimProductData, summary: string): Promise<number> {
  const [row] = await tx
    .insert(pimProducts)
    .values({ ...productColumns(data), createdBy: userId, updatedBy: userId })
    .returning({ id: pimProducts.id })
  await writeParts(tx, row!.id, data)
  await tx.insert(pimHistory).values({ productId: row!.id, changedBy: userId, summary, changes: [] })
  return row!.id
}

async function updateProductRow(
  tx: Tx,
  userId: string,
  id: number,
  before: PimProductData,
  after: PimProductData,
  names: NameContext,
  prefix = ''
): Promise<boolean> {
  const changes = diffProducts(before, after, names)
  if (changes.length === 0) return false
  await tx.update(pimProducts).set({ ...productColumns(after), updatedBy: userId, updatedAt: new Date() }).where(eq(pimProducts.id, id))
  await writeParts(tx, id, after)
  const summary = `${prefix}${changes.map(describePimChange).join('; ')}`.slice(0, 2000)
  await tx.insert(pimHistory).values({ productId: id, changedBy: userId, summary, changes })
  return true
}

export async function createPimProduct(db: Db, userId: string, body: PimProductBody) {
  const data = await cleanPimProduct(db, body)
  try {
    return { id: await db.transaction(tx => insertProduct(tx, userId, data, 'Created')) }
  } catch (err) {
    if (isUniqueViolation(err)) throw new PimError(409, noProductNoMessage(data.productNo))
    throw err
  }
}

export async function updatePimProduct(db: Db, userId: string, id: number, body: PimProductBody) {
  const existing = await loadProductData(db, id)
  if (!existing) throw new PimError(404, 'That product no longer exists.')
  const after = await cleanPimProduct(db, body, existing.data)
  const names = await loadNameContext(db)
  try {
    await db.transaction(tx => updateProductRow(tx, userId, id, existing.data, after, names))
  } catch (err) {
    if (isUniqueViolation(err)) throw new PimError(409, noProductNoMessage(after.productNo))
    throw err
  }
  return { id }
}

/** Deletes the product and (best effort) its stored files. Admins only (checked by the route). */
export async function deletePimProduct(db: Db, id: number) {
  const files = await db.select({ key: pimFiles.r2Key }).from(pimFiles).where(eq(pimFiles.productId, id))
  const deleted = await db.delete(pimProducts).where(eq(pimProducts.id, id)).returning({ id: pimProducts.id })
  if (deleted.length === 0) throw new PimError(404, 'That product no longer exists.')
  await Promise.all(files.map(f => deleteObject(f.key).catch(() => {})))
}

// ------------------------------------------------------------- Completeness

/** Completeness for several products at once, by product id. */
async function completenessFor(db: Runner, rows: (typeof pimProducts.$inferSelect)[]) {
  const ids = rows.map(r => r.id)
  const result = new Map<number, ReturnType<typeof pimCompleteness>>()
  if (ids.length === 0) return result
  const categoryIds = [...new Set(rows.map(r => r.categoryId).filter((c): c is number => c !== null))]
  const [cats, attrs, supplierCounts, imageCounts, packs, values] = await Promise.all([
    categoryIds.length ? db.select().from(pimCategories).where(inArray(pimCategories.id, categoryIds)) : Promise.resolve([]),
    categoryIds.length
      ? db.select().from(pimAttributes).where(and(inArray(pimAttributes.categoryId, categoryIds), eq(pimAttributes.required, true), eq(pimAttributes.active, true)))
      : Promise.resolve([]),
    db.select({ productId: pimProductSuppliers.productId, n: sql<number>`count(*)::int` }).from(pimProductSuppliers).where(inArray(pimProductSuppliers.productId, ids)).groupBy(pimProductSuppliers.productId),
    db.select({ productId: pimFiles.productId, n: sql<number>`count(*)::int` }).from(pimFiles).where(and(inArray(pimFiles.productId, ids), eq(pimFiles.kind, 'image'))).groupBy(pimFiles.productId),
    db.select().from(pimPackaging).where(inArray(pimPackaging.productId, ids)),
    db.select().from(pimAttributeValues).where(inArray(pimAttributeValues.productId, ids))
  ])
  const supplierN = new Map(supplierCounts.map(r => [r.productId, r.n]))
  const imageN = new Map(imageCounts.map(r => [r.productId, r.n]))
  const hasPack = new Set(packs.filter(p => [p.lengthCm, p.widthCm, p.heightCm, p.weightKg, p.qtyInside].some(v => v !== null)).map(p => p.productId))
  for (const r of rows) {
    const cat = cats.find(c => c.id === r.categoryId)
    const required = (cat?.requiredFields ?? []).filter((f): f is PimRequirableField => f in PIM_REQUIRABLE_FIELDS)
    const requiredAttrs = attrs.filter(a => a.categoryId === r.categoryId).map(a => ({ id: a.id, name: a.name }))
    result.set(r.id, pimCompleteness(
      {
        shortDescription: r.shortDescription,
        longDescription: r.longDescription,
        brand: r.brand,
        supplierCount: supplierN.get(r.id) ?? 0,
        barcode: r.barcode,
        rrp: r.rrp,
        imageCount: imageN.get(r.id) ?? 0,
        hasPackaging: hasPack.has(r.id),
        attributeValues: Object.fromEntries(values.filter(v => v.productId === r.id).map(v => [v.attributeId, v.value]))
      },
      required,
      requiredAttrs
    ))
  }
  return result
}

// ------------------------------------------------------------------ Reading

export interface PimListFilters {
  q?: string
  status?: string
  categoryId?: number
  subCategoryId?: number
  page?: number
}

function listWhere(filters: PimListFilters): SQL | undefined {
  const conds: SQL[] = []
  const q = tidyPimText(filters.q)
  if (q) {
    const pat = `%${escapeLike(q)}%`
    conds.push(or(
      sql`${pimProducts.productNo} ilike ${pat}`,
      sql`${pimProducts.name} ilike ${pat}`,
      sql`${pimProducts.brand} ilike ${pat}`,
      sql`${pimProducts.barcode} ilike ${pat}`,
      sql`exists (select 1 from pim_product_suppliers s where s.product_id = ${pimProducts.id} and (s.name ilike ${pat} or s.supplier_code ilike ${pat}))`
    )!)
  }
  if (filters.status && isPimStatus(filters.status)) conds.push(eq(pimProducts.status, filters.status))
  if (filters.categoryId) conds.push(eq(pimProducts.categoryId, filters.categoryId))
  if (filters.subCategoryId) conds.push(eq(pimProducts.subCategoryId, filters.subCategoryId))
  return conds.length ? and(...conds) : undefined
}

/** Reads the list / export filters from a query string. */
export function pimListFiltersFromQuery(query: Record<string, unknown>): PimListFilters {
  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 ? n : undefined
  }
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return {
    q: text(query.q),
    status: text(query.status),
    categoryId: num(query.categoryId),
    subCategoryId: num(query.subCategoryId),
    page: num(query.page)
  }
}

export async function listPimProducts(db: Db, filters: PimListFilters): Promise<PimListResponse> {
  const where = listWhere(filters)
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const [{ n: total } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(pimProducts).where(where)
  const rows = await db
    .select()
    .from(pimProducts)
    .where(where)
    .orderBy(asc(sql`lower(${pimProducts.productNo})`))
    .limit(PIM_PAGE_SIZE)
    .offset((page - 1) * PIM_PAGE_SIZE)
  const ids = rows.map(r => r.id)
  const [names, suppliers, mains, completeness] = await Promise.all([
    loadNameContext(db),
    ids.length ? db.select().from(pimProductSuppliers).where(inArray(pimProductSuppliers.productId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(pimFiles).where(and(inArray(pimFiles.productId, ids), eq(pimFiles.isMain, true))) : Promise.resolve([]),
    completenessFor(db, rows)
  ])
  const items: PimListItem[] = await Promise.all(rows.map(async (r) => {
    const mine = suppliers.filter(s => s.productId === r.id)
    const main = mains.find(m => m.productId === r.id)
    return {
      id: r.id,
      productNo: r.productNo,
      name: r.name,
      status: r.status,
      brand: r.brand,
      categoryName: r.categoryId ? (names.categoryNames.get(r.categoryId) ?? null) : null,
      subCategoryName: r.subCategoryId ? (names.categoryNames.get(r.subCategoryId) ?? null) : null,
      primarySupplier: mine.find(s => s.isPrimary)?.name ?? null,
      supplierCount: mine.length,
      rrp: r.rrp,
      mainImageUrl: main ? await getDownloadUrl(main.r2Key, FILE_LINK_SECONDS) : null,
      completenessPercent: completeness.get(r.id)?.percent ?? 100,
      updatedAt: r.updatedAt.toISOString()
    }
  }))
  return { items, total, page, pageSize: PIM_PAGE_SIZE }
}

export async function getPimProduct(db: Db, id: number): Promise<PimProductView> {
  const loaded = await loadProductData(db, id)
  if (!loaded) throw new PimError(404, 'That product no longer exists.')
  const { row, data } = loaded
  const [files, completeness, people] = await Promise.all([
    db.select().from(pimFiles).where(eq(pimFiles.productId, id)).orderBy(desc(pimFiles.isMain), asc(pimFiles.createdAt), asc(pimFiles.id)),
    completenessFor(db, [row]),
    db
      .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email })
      .from(profiles)
      .where(inArray(profiles.id, [row.createdBy, row.updatedBy].filter((p): p is string => !!p)))
  ])
  const nameOf = (uid: string | null) => {
    const p = people.find(x => x.id === uid)
    return p ? (p.fullName || p.email) : null
  }
  return {
    id,
    productNo: data.productNo,
    name: data.name,
    status: data.status,
    brand: data.brand,
    categoryId: data.categoryId,
    subCategoryId: data.subCategoryId,
    shortDescription: data.shortDescription,
    longDescription: data.longDescription,
    barcode: data.barcode,
    rrp: data.rrp,
    suppliers: data.suppliers,
    packaging: data.packaging,
    attributeValues: data.attributes,
    files: await Promise.all(files.map(fileItem)),
    completeness: completeness.get(id)!,
    createdByName: nameOf(row.createdBy),
    updatedByName: nameOf(row.updatedBy),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

async function fileItem(f: typeof pimFiles.$inferSelect): Promise<PimFileItem> {
  return {
    id: f.id,
    kind: f.kind,
    fileName: f.fileName,
    contentType: f.contentType,
    sizeBytes: f.sizeBytes,
    isMain: f.isMain,
    url: await getDownloadUrl(f.r2Key, FILE_LINK_SECONDS),
    createdAt: f.createdAt.toISOString()
  }
}

export async function listPimHistory(db: Db, productId: number): Promise<PimHistoryItem[]> {
  const rows = await db
    .select({
      id: pimHistory.id,
      summary: pimHistory.summary,
      changes: pimHistory.changes,
      createdAt: pimHistory.createdAt,
      fullName: profiles.fullName,
      email: profiles.email
    })
    .from(pimHistory)
    .leftJoin(profiles, eq(profiles.id, pimHistory.changedBy))
    .where(eq(pimHistory.productId, productId))
    .orderBy(desc(pimHistory.createdAt), desc(pimHistory.id))
    .limit(200)
  return rows.map(r => ({
    id: r.id,
    summary: r.summary,
    changes: r.changes,
    changedByName: r.fullName || r.email || null,
    createdAt: r.createdAt.toISOString()
  }))
}

// -------------------------------------------------------------------- Files

async function requireProduct(db: Runner, productId: number) {
  const [p] = await db.select({ id: pimProducts.id }).from(pimProducts).where(eq(pimProducts.id, productId))
  if (!p) throw new PimError(404, 'That product no longer exists.')
}

async function addHistory(db: Runner, productId: number, userId: string, summary: string) {
  await db.insert(pimHistory).values({ productId, changedBy: userId, summary, changes: [] })
  await db.update(pimProducts).set({ updatedBy: userId, updatedAt: new Date() }).where(eq(pimProducts.id, productId))
}

/** Step 1 of adding a file: approve the type and size, return a short-lived link that takes exactly that size. */
export async function createPimFileUpload(db: Db, productId: number, file: { fileName: string, sizeBytes: number, kind: PimFileKind }) {
  await requireProduct(db, productId)
  const fileName = tidyProjectFileName(file.fileName)
  const problem = pimFileProblem(fileName, file.sizeBytes, file.kind)
  if (problem) throw new PimError(400, problem)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(pimFiles).where(eq(pimFiles.productId, productId))
  if (count!.n >= PIM_MAX_FILES) throw new PimError(400, `A product can have at most ${PIM_MAX_FILES} files.`)
  const contentType = projectFileContentType(fileName)
  const key = buildObjectKey(PIM_STORAGE_FOLDER, fileName)
  return { uploadUrl: await getUploadUrl(key, contentType, 300, file.sizeBytes), key, contentType }
}

/** Step 3: confirm the file is really there at an allowed size, then record it. The first image becomes the main one. */
export async function registerPimFile(
  db: Db,
  userId: string,
  productId: number,
  file: { key: string, fileName: string, kind: PimFileKind }
) {
  await requireProduct(db, productId)
  if (!file.key.startsWith(`${PIM_STORAGE_FOLDER}/`) || file.key.includes('..')) throw new PimError(400, 'That is not a product file.')
  const size = await headObjectSize(file.key)
  if (size === null) throw new PimError(400, 'The file did not finish uploading. Please try again.')
  const fileName = tidyProjectFileName(file.fileName)
  const problem = pimFileProblem(fileName, size, file.kind)
  if (problem) {
    await deleteObject(file.key).catch(() => {})
    throw new PimError(400, problem)
  }
  const [taken] = await db.select({ id: pimFiles.id }).from(pimFiles).where(eq(pimFiles.r2Key, file.key))
  if (taken) throw new PimError(409, 'That file is already attached.')

  return db.transaction(async (tx) => {
    const [images] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(pimFiles)
      .where(and(eq(pimFiles.productId, productId), eq(pimFiles.kind, 'image')))
    const [row] = await tx
      .insert(pimFiles)
      .values({
        productId,
        kind: file.kind,
        r2Key: file.key,
        fileName,
        contentType: projectFileContentType(fileName),
        sizeBytes: size,
        isMain: file.kind === 'image' && pimNextImageIsMain(images!.n),
        uploadedBy: userId
      })
      .returning({ id: pimFiles.id })
    await addHistory(tx, productId, userId, `Added ${file.kind} "${fileName}"`)
    return row!
  })
}

export async function deletePimFile(db: Db, userId: string, productId: number, fileId: number) {
  const [file] = await db.select().from(pimFiles).where(and(eq(pimFiles.id, fileId), eq(pimFiles.productId, productId)))
  if (!file) throw new PimError(404, 'That file no longer exists.')
  await db.transaction(async (tx) => {
    await tx.delete(pimFiles).where(eq(pimFiles.id, fileId))
    if (file.isMain) {
      const [next] = await tx
        .select({ id: pimFiles.id })
        .from(pimFiles)
        .where(and(eq(pimFiles.productId, productId), eq(pimFiles.kind, 'image')))
        .orderBy(asc(pimFiles.createdAt), asc(pimFiles.id))
        .limit(1)
      if (next) await tx.update(pimFiles).set({ isMain: true }).where(eq(pimFiles.id, next.id))
    }
    await addHistory(tx, productId, userId, `Removed ${file.kind} "${file.fileName}"`)
  })
  await deleteObject(file.r2Key).catch(() => {})
}

export async function setPimMainImage(db: Db, userId: string, productId: number, fileId: number) {
  const [file] = await db.select().from(pimFiles).where(and(eq(pimFiles.id, fileId), eq(pimFiles.productId, productId)))
  if (!file) throw new PimError(404, 'That file no longer exists.')
  if (file.kind !== 'image') throw new PimError(400, 'Only an image can be the main image.')
  if (file.isMain) return
  await db.transaction(async (tx) => {
    await tx.update(pimFiles).set({ isMain: false }).where(and(eq(pimFiles.productId, productId), eq(pimFiles.isMain, true)))
    await tx.update(pimFiles).set({ isMain: true }).where(eq(pimFiles.id, fileId))
    await addHistory(tx, productId, userId, `Main image is now "${file.fileName}"`)
  })
}

// --------------------------------------------------------------- CSV export

const supplierCell = (suppliers: PimSupplier[]) =>
  [...suppliers].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map(s => (s.supplierCode ? `${s.name}: ${s.supplierCode}` : s.name))
    .join('; ')

export async function exportPimCsv(db: Db, filters: PimListFilters): Promise<{ csv: string, fileName: string }> {
  const rows = await db.select().from(pimProducts).where(listWhere(filters)).orderBy(asc(sql`lower(${pimProducts.productNo})`))
  const ids = rows.map(r => r.id)
  const [names, suppliers] = await Promise.all([
    loadNameContext(db),
    ids.length ? db.select().from(pimProductSuppliers).where(inArray(pimProductSuppliers.productId, ids)).orderBy(asc(pimProductSuppliers.sortOrder)) : Promise.resolve([])
  ])
  const csv = buildPimCsv(rows.map(r => [
    r.productNo,
    r.name,
    r.status,
    r.brand,
    r.categoryId ? names.categoryNames.get(r.categoryId) : '',
    r.subCategoryId ? names.categoryNames.get(r.subCategoryId) : '',
    supplierCell(suppliers.filter(s => s.productId === r.id).map(s => ({ name: s.name, supplierCode: s.supplierCode, isPrimary: s.isPrimary }))),
    r.shortDescription,
    r.longDescription,
    r.barcode,
    r.rrp
  ]))
  return { csv, fileName: `products-${todayISO()}.csv` }
}

// --------------------------------------------------------------- CSV import

interface ImportPlan {
  creates: PimProductData[]
  updates: { id: number, before: PimProductData, after: PimProductData }[]
  problems: string[]
}

/**
 * Works out, row by row, what an import would create or update. Existing
 * products are matched by product number; **a blank cell never erases what is
 * already saved**. Categories must already exist (an admin adds them).
 */
async function planImport(db: Db, rows: PimImportRow[]): Promise<ImportPlan> {
  const problems: string[] = []
  const cats = await db.select().from(pimCategories)
  const topByName = new Map(cats.filter(c => c.parentId === null).map(c => [c.name.toLowerCase(), c]))
  const existingRows = rows.length
    ? await db.select({ id: pimProducts.id, productNo: pimProducts.productNo }).from(pimProducts).where(inArray(sql`lower(${pimProducts.productNo})`, rows.map(r => pimProductNoKey(r.productNo))))
    : []
  const existingId = new Map(existingRows.map(r => [pimProductNoKey(r.productNo), r.id]))
  const attrs = await db.select({ id: pimAttributes.id, categoryId: pimAttributes.categoryId }).from(pimAttributes)
  const plan: ImportPlan = { creates: [], updates: [], problems }

  for (const r of rows) {
    const fail = (msg: string) => problems.push(`Row ${r.line}: ${msg}`)
    let categoryId: number | null | undefined
    let subCategoryId: number | null | undefined
    if (r.category) {
      const top = topByName.get(r.category.toLowerCase())
      if (!top) fail(`there is no category called "${r.category}". Ask an admin to add it first`)
      else {
        categoryId = top.id
        if (r.subCategory) {
          const sub = cats.find(c => c.parentId === top.id && c.name.toLowerCase() === r.subCategory!.toLowerCase())
          if (!sub) fail(`there is no sub-category "${r.subCategory}" under "${top.name}". Ask an admin to add it first`)
          else subCategoryId = sub.id
        }
      }
    }

    const id = existingId.get(pimProductNoKey(r.productNo))
    const loaded = id ? await loadProductData(db, id) : null
    const base: PimProductData = loaded?.data ?? {
      productNo: r.productNo, name: r.name, status: 'draft', brand: null, categoryId: null, subCategoryId: null,
      shortDescription: null, longDescription: null, barcode: null, rrp: null, suppliers: [], packaging: [], attributes: {}
    }
    const after: PimProductData = {
      ...base,
      productNo: r.productNo,
      name: r.name,
      // The reader can't tell a blank status from "draft", so on an existing product only a non-draft status changes it.
      status: loaded && r.status === 'draft' ? base.status : r.status,
      brand: r.brand ?? base.brand,
      categoryId: categoryId === undefined ? base.categoryId : categoryId,
      // A blank sub-category keeps the saved one, unless the category itself is changing.
      subCategoryId: subCategoryId !== undefined
        ? subCategoryId
        : (categoryId === undefined || categoryId === base.categoryId ? base.subCategoryId : null),
      shortDescription: r.shortDescription ?? base.shortDescription,
      longDescription: r.longDescription ?? base.longDescription,
      barcode: r.barcode ?? base.barcode,
      rrp: r.rrp === null ? base.rrp : fixed(r.rrp, 2),
      suppliers: r.suppliers.length ? r.suppliers : base.suppliers
    }
    // Attribute values only make sense inside their own category.
    after.attributes = Object.fromEntries(
      Object.entries(base.attributes).filter(([attrId]) => attrs.find(a => a.id === Number(attrId))?.categoryId === after.categoryId)
    )
    if (id && loaded) plan.updates.push({ id, before: loaded.data, after })
    else plan.creates.push(after)
  }
  return plan
}

export async function importPimProducts(db: Db, userId: string, rows: PimImportRow[], apply: boolean) {
  const plan = await planImport(db, rows)
  const response = { created: plan.creates.length, updated: plan.updates.length, problems: plan.problems, applied: false }
  if (plan.problems.length || !apply) return response
  const names = await loadNameContext(db)
  try {
    let changed = 0
    await db.transaction(async (tx) => {
      for (const data of plan.creates) await insertProduct(tx, userId, data, 'Created by CSV import')
      for (const u of plan.updates) {
        if (await updateProductRow(tx, userId, u.id, u.before, u.after, names, 'CSV import: ')) changed++
      }
    })
    return { ...response, updated: changed, applied: true }
  } catch (err) {
    if (isUniqueViolation(err)) throw new PimError(409, 'Someone saved a product with one of these product numbers while the import was running. Please try again.')
    throw err
  }
}
