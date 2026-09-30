import { and, asc, eq, sql } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import { costCategories, costSubCategories } from '~~/server/db/schema'
import { sortByCostName, tidyCostName, type CostCategory } from '~~/shared/utils/costCategories'

type Db = ReturnType<typeof useDb>

/** Every category with its sub-categories, both A-Z. */
export async function listCostCategories(db: Db): Promise<CostCategory[]> {
  const cats = await db
    .select({ id: costCategories.id, name: costCategories.name })
    .from(costCategories)
    .orderBy(asc(costCategories.id))
  const subs = await db
    .select({ id: costSubCategories.id, name: costSubCategories.name, categoryId: costSubCategories.categoryId })
    .from(costSubCategories)
    .orderBy(asc(costSubCategories.id))

  return sortByCostName(cats.map(c => ({
    ...c,
    subCategories: sortByCostName(subs.filter(s => s.categoryId === c.id).map(({ id, name }) => ({ id, name })))
  })))
}

/**
 * Returns the category with this name (ignoring case), creating it if it
 * doesn't exist. `created` is false when an existing one was matched.
 * Race-safe: two people adding the same name at once both get the same row.
 */
export async function findOrCreateCostCategory(db: Db, userId: string, rawName: string) {
  const name = tidyCostName(rawName)
  const inserted = await db
    .insert(costCategories)
    .values({ name, createdBy: userId })
    .onConflictDoNothing()
    .returning({ id: costCategories.id, name: costCategories.name })
  if (inserted[0]) return { category: inserted[0], created: true }

  const [existing] = await db
    .select({ id: costCategories.id, name: costCategories.name })
    .from(costCategories)
    .where(sql`lower(${costCategories.name}) = lower(${name})`)
  if (!existing) throw createError({ statusCode: 500, statusMessage: 'Could not save the category.' })
  return { category: existing, created: false }
}

/** Same as above for a sub-category under one category. Null if the category doesn't exist. */
export async function findOrCreateCostSubCategory(db: Db, userId: string, categoryId: number, rawName: string) {
  const [category] = await db
    .select({ id: costCategories.id })
    .from(costCategories)
    .where(eq(costCategories.id, categoryId))
  if (!category) return null

  const name = tidyCostName(rawName)
  const inserted = await db
    .insert(costSubCategories)
    .values({ categoryId, name, createdBy: userId })
    .onConflictDoNothing()
    .returning({ id: costSubCategories.id, name: costSubCategories.name })
  if (inserted[0]) return { subCategory: inserted[0], created: true }

  const [existing] = await db
    .select({ id: costSubCategories.id, name: costSubCategories.name })
    .from(costSubCategories)
    .where(and(
      eq(costSubCategories.categoryId, categoryId),
      sql`lower(${costSubCategories.name}) = lower(${name})`
    ))
  if (!existing) throw createError({ statusCode: 500, statusMessage: 'Could not save the sub-category.' })
  return { subCategory: existing, created: false }
}
