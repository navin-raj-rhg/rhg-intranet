/**
 * Pure helpers for Cost Modelling categories and sub-categories (Step 11.6).
 * Names are tidied the same way on screen and on the server, so "  hand   tools "
 * and "Hand Tools" are recognised as the same entry.
 */

export const COST_NAME_MAX = 80

export interface CostSubCategory {
  id: number
  name: string
}

export interface CostCategory {
  id: number
  name: string
  subCategories: CostSubCategory[]
}

/** Trim and collapse runs of spaces. Case is kept as typed. */
export function tidyCostName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Plain-English problem with a name, or '' if it's fine. */
export function costNameProblem(raw: string, what = 'Name'): string {
  const name = tidyCostName(raw)
  if (!name) return `${what} can't be blank`
  if (name.length > COST_NAME_MAX) return `${what} must be ${COST_NAME_MAX} characters or fewer`
  return ''
}

/** Same entry, ignoring case and extra spaces. */
export function sameCostName(a: string, b: string): boolean {
  return tidyCostName(a).toLowerCase() === tidyCostName(b).toLowerCase()
}

/** A-Z, ignoring case. */
export function sortByCostName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}
