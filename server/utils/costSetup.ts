import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import {
  costCategories,
  costFreightRates,
  costLocalCosts,
  costLocalFeeTypes,
  costModels,
  costPorts,
  costSubCategories
} from '~~/server/db/schema'
import { costNameProblem, sortByCostName, tidyCostName } from '~~/shared/utils/costCategories'
import { feeTypeKeyFromName, nextSortOrder, portCodeProblem, tidyPortCode } from '~~/shared/utils/costSetup'

type Db = ReturnType<typeof useDb>

/**
 * Admin changes to the lists behind Cost Modelling (Step 13.6b): categories,
 * sub-categories, ports and local-cost charge lines. Saved models are never
 * rewritten - their frozen Factors and figures stay as saved, and so do their
 * names. Ports and charge lines are switched off, never deleted, because saved
 * models mention them.
 */

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export function parseCostId(event: Parameters<typeof getRouterParam>[0], param = 'id'): number {
  const id = Number(getRouterParam(event, param))
  if (!Number.isInteger(id) || id <= 0) fail(400, 'Invalid id.')
  return id
}

/* ---------------- everything the Setup tab shows ---------------- */

export async function loadCostSetup(db: Db) {
  const [cats, subs, models, ports, feeTypes] = await Promise.all([
    db.select().from(costCategories),
    db.select().from(costSubCategories),
    db.select({
      categoryId: costModels.categoryId,
      subCategoryId: costModels.subCategoryId,
      originPortId: costModels.originPortId
    }).from(costModels),
    db.select().from(costPorts).orderBy(asc(costPorts.sortOrder), asc(costPorts.id)),
    db.select().from(costLocalFeeTypes).orderBy(asc(costLocalFeeTypes.sortOrder), asc(costLocalFeeTypes.id))
  ])

  const modelsIn = (pick: (m: typeof models[number]) => number | null, id: number) =>
    models.filter(m => pick(m) === id).length

  return {
    categories: sortByCostName(cats.map(c => ({
      id: c.id,
      name: c.name,
      modelCount: modelsIn(m => m.categoryId, c.id),
      subCategories: sortByCostName(subs.filter(s => s.categoryId === c.id).map(s => ({
        id: s.id,
        name: s.name,
        modelCount: modelsIn(m => m.subCategoryId, s.id)
      })))
    }))),
    ports: ports.map(p => ({
      id: p.id,
      kind: p.kind,
      code: p.code,
      name: p.name,
      active: p.active,
      modelCount: p.kind === 'origin' ? modelsIn(m => m.originPortId, p.id) : 0
    })),
    feeTypes: feeTypes.map(f => ({ id: f.id, name: f.name, active: f.active }))
  }
}

/* ---------------- categories ---------------- */

async function requireCategory(db: Db, id: number) {
  const [row] = await db.select().from(costCategories).where(eq(costCategories.id, id))
  if (!row) fail(404, 'That category no longer exists.')
  return row
}

export async function renameCostCategory(db: Db, id: number, rawName: string) {
  const problem = costNameProblem(rawName, 'Category')
  if (problem) fail(400, problem)
  const name = tidyCostName(rawName)
  await requireCategory(db, id)

  const [clash] = await db.select({ id: costCategories.id }).from(costCategories)
    .where(and(sql`lower(${costCategories.name}) = lower(${name})`, ne(costCategories.id, id)))
  if (clash) fail(409, `There is already a category called "${name}". Use Merge to combine them.`)

  await db.update(costCategories).set({ name }).where(eq(costCategories.id, id))
  return { id, name }
}

/** Moves everything from one category into another, then removes the empty one. */
export async function mergeCostCategories(db: Db, fromId: number, intoId: number) {
  if (fromId === intoId) fail(400, 'Pick a different category to merge into.')
  const from = await requireCategory(db, fromId)
  const into = await requireCategory(db, intoId)

  await db.transaction(async (tx) => {
    const fromSubs = await tx.select().from(costSubCategories).where(eq(costSubCategories.categoryId, fromId))
    const intoSubs = await tx.select().from(costSubCategories).where(eq(costSubCategories.categoryId, intoId))

    for (const sub of fromSubs) {
      const same = intoSubs.find(s => s.name.toLowerCase() === sub.name.toLowerCase())
      if (same) {
        await tx.update(costModels).set({ subCategoryId: same.id }).where(eq(costModels.subCategoryId, sub.id))
        await tx.delete(costSubCategories).where(eq(costSubCategories.id, sub.id))
      } else {
        await tx.update(costSubCategories).set({ categoryId: intoId }).where(eq(costSubCategories.id, sub.id))
      }
    }
    await tx.update(costModels).set({ categoryId: intoId }).where(eq(costModels.categoryId, fromId))
    await tx.delete(costCategories).where(eq(costCategories.id, fromId))
  })
  return { merged: from.name, into: into.name }
}

export async function deleteCostCategory(db: Db, id: number) {
  const cat = await requireCategory(db, id)
  await db.transaction(async (tx) => {
    const [used] = await tx.select({ n: count() }).from(costModels).where(eq(costModels.categoryId, id))
    if ((used?.n ?? 0) > 0) {
      fail(409, `${used!.n} saved cost model${used!.n === 1 ? ' uses' : 's use'} this category, so it can't be deleted. Merge it into another category instead.`)
    }
    // Sub-categories can only be unused here (a model using one also uses its category).
    await tx.delete(costSubCategories).where(eq(costSubCategories.categoryId, id))
    await tx.delete(costCategories).where(eq(costCategories.id, id))
  })
  return { deleted: cat.name }
}

/* ---------------- sub-categories ---------------- */

async function requireSubCategory(db: Db, id: number) {
  const [row] = await db.select().from(costSubCategories).where(eq(costSubCategories.id, id))
  if (!row) fail(404, 'That sub-category no longer exists.')
  return row
}

export async function renameCostSubCategory(db: Db, id: number, rawName: string) {
  const problem = costNameProblem(rawName, 'Sub-category')
  if (problem) fail(400, problem)
  const name = tidyCostName(rawName)
  const sub = await requireSubCategory(db, id)

  const [clash] = await db.select({ id: costSubCategories.id }).from(costSubCategories)
    .where(and(
      eq(costSubCategories.categoryId, sub.categoryId),
      sql`lower(${costSubCategories.name}) = lower(${name})`,
      ne(costSubCategories.id, id)
    ))
  if (clash) fail(409, `There is already a sub-category called "${name}" in this category. Use Merge to combine them.`)

  await db.update(costSubCategories).set({ name }).where(eq(costSubCategories.id, id))
  return { id, name }
}

export async function mergeCostSubCategories(db: Db, fromId: number, intoId: number) {
  if (fromId === intoId) fail(400, 'Pick a different sub-category to merge into.')
  const from = await requireSubCategory(db, fromId)
  const into = await requireSubCategory(db, intoId)
  if (from.categoryId !== into.categoryId) fail(400, 'Sub-categories can only be merged within the same category.')

  await db.transaction(async (tx) => {
    await tx.update(costModels).set({ subCategoryId: intoId }).where(eq(costModels.subCategoryId, fromId))
    await tx.delete(costSubCategories).where(eq(costSubCategories.id, fromId))
  })
  return { merged: from.name, into: into.name }
}

export async function deleteCostSubCategory(db: Db, id: number) {
  const sub = await requireSubCategory(db, id)
  const [used] = await db.select({ n: count() }).from(costModels).where(eq(costModels.subCategoryId, id))
  if ((used?.n ?? 0) > 0) {
    fail(409, `${used!.n} saved cost model${used!.n === 1 ? ' uses' : 's use'} this sub-category, so it can't be deleted. Merge it into another one instead.`)
  }
  await db.delete(costSubCategories).where(eq(costSubCategories.id, id))
  return { deleted: sub.name }
}

/* ---------------- ports ---------------- */

/** Adds a ship-from or AU port with zero freight / local-cost rows ready to fill in on Factors. */
export async function addCostPort(db: Db, input: { kind: 'origin' | 'destination', code: string, name: string }) {
  const codeProblem = portCodeProblem(input.code)
  if (codeProblem) fail(400, codeProblem)
  const nameProblem = costNameProblem(input.name, 'Port name')
  if (nameProblem) fail(400, nameProblem)
  const code = tidyPortCode(input.code)
  const name = tidyCostName(input.name)

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(costPorts)
    if (existing.some(p => p.code === code)) fail(409, `There is already a port with the code ${code}.`)
    if (existing.some(p => p.kind === input.kind && p.name.toLowerCase() === name.toLowerCase())) {
      fail(409, `There is already a port called "${name}".`)
    }

    const [port] = await tx.insert(costPorts).values({
      kind: input.kind,
      code,
      name,
      sortOrder: nextSortOrder(existing.filter(p => p.kind === input.kind).map(p => p.sortOrder))
    }).returning()
    if (!port) fail(500, 'Could not add the port.')

    if (input.kind === 'origin') {
      const destinations = existing.filter(p => p.kind === 'destination')
      if (destinations.length) {
        await tx.insert(costFreightRates).values(destinations.map(d => ({ originPortId: port.id, destinationPortId: d.id })))
      }
    } else {
      const origins = existing.filter(p => p.kind === 'origin')
      if (origins.length) {
        await tx.insert(costFreightRates).values(origins.map(o => ({ originPortId: o.id, destinationPortId: port.id })))
      }
      const fees = await tx.select({ id: costLocalFeeTypes.id }).from(costLocalFeeTypes)
      if (fees.length) {
        await tx.insert(costLocalCosts).values(fees.map(f => ({ destinationPortId: port.id, feeTypeId: f.id })))
      }
    }
    return { id: port.id, code: port.code, name: port.name }
  })
}

export async function updateCostPort(db: Db, id: number, input: { name?: string, active?: boolean }) {
  const [port] = await db.select().from(costPorts).where(eq(costPorts.id, id))
  if (!port) fail(404, 'That port no longer exists.')

  const set: { name?: string, active?: boolean } = {}
  if (input.name !== undefined) {
    const problem = costNameProblem(input.name, 'Port name')
    if (problem) fail(400, problem)
    set.name = tidyCostName(input.name)
  }
  if (input.active !== undefined) {
    if (!input.active) {
      const [others] = await db.select({ n: count() }).from(costPorts)
        .where(and(eq(costPorts.kind, port.kind), eq(costPorts.active, true), ne(costPorts.id, id)))
      if ((others?.n ?? 0) === 0) {
        fail(409, port.kind === 'origin' ? 'At least one ship-from port must stay switched on.' : 'At least one AU port must stay switched on.')
      }
    }
    set.active = input.active
  }
  if (Object.keys(set).length === 0) fail(400, 'Nothing to change.')

  await db.update(costPorts).set(set).where(eq(costPorts.id, id))
  return { id, ...set }
}

/* ---------------- local-cost charge lines ---------------- */

export async function addCostFeeType(db: Db, rawName: string) {
  const problem = costNameProblem(rawName, 'Charge line name')
  if (problem) fail(400, problem)
  const name = tidyCostName(rawName)
  const baseKey = feeTypeKeyFromName(name)
  if (!baseKey) fail(400, 'Charge line name needs some letters or numbers.')

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(costLocalFeeTypes)
    if (existing.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      fail(409, `There is already a charge line called "${name}".`)
    }
    let key = baseKey
    for (let n = 2; existing.some(f => f.key === key); n++) key = `${baseKey}_${n}`

    const [fee] = await tx.insert(costLocalFeeTypes).values({
      key,
      name,
      sortOrder: nextSortOrder(existing.map(f => f.sortOrder))
    }).returning()
    if (!fee) fail(500, 'Could not add the charge line.')

    const destinations = await tx.select({ id: costPorts.id }).from(costPorts).where(eq(costPorts.kind, 'destination'))
    if (destinations.length) {
      await tx.insert(costLocalCosts).values(destinations.map(d => ({ destinationPortId: d.id, feeTypeId: fee.id })))
    }
    return { id: fee.id, name: fee.name }
  })
}

export async function updateCostFeeType(db: Db, id: number, input: { name?: string, active?: boolean }) {
  const [fee] = await db.select().from(costLocalFeeTypes).where(eq(costLocalFeeTypes.id, id))
  if (!fee) fail(404, 'That charge line no longer exists.')

  const set: { name?: string, active?: boolean } = {}
  if (input.name !== undefined) {
    const problem = costNameProblem(input.name, 'Charge line name')
    if (problem) fail(400, problem)
    const name = tidyCostName(input.name)
    const [clash] = await db.select({ id: costLocalFeeTypes.id }).from(costLocalFeeTypes)
      .where(and(sql`lower(${costLocalFeeTypes.name}) = lower(${name})`, ne(costLocalFeeTypes.id, id)))
    if (clash) fail(409, `There is already a charge line called "${name}".`)
    set.name = name
  }
  if (input.active !== undefined) set.active = input.active
  if (Object.keys(set).length === 0) fail(400, 'Nothing to change.')

  await db.update(costLocalFeeTypes).set(set).where(eq(costLocalFeeTypes.id, id))
  return { id, ...set }
}
