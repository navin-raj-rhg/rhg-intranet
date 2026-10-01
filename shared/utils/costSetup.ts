/**
 * Pure helpers for the Cost Modelling Setup tab (Step 13.6b): the rules for
 * port codes and charge-line names, shared by the screen and the server.
 */
import { tidyCostName } from './costCategories.ts'

export const PORT_CODE_MIN = 2
export const PORT_CODE_MAX = 6

/** Short port code as typed: upper case, letters and numbers only. */
export function tidyPortCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/** Plain-English problem with a port code, or '' if it's fine. */
export function portCodeProblem(raw: string): string {
  const code = tidyPortCode(raw)
  if (code.length < PORT_CODE_MIN || code.length > PORT_CODE_MAX) {
    return `Port code must be ${PORT_CODE_MIN} to ${PORT_CODE_MAX} letters or numbers, e.g. HBA`
  }
  return ''
}

/** Stable internal key for a new charge line, e.g. "Demurrage Fee" -> "demurrage_fee". */
export function feeTypeKeyFromName(raw: string): string {
  return tidyCostName(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Next sort position, leaving gaps of 10 like the seed data. */
export function nextSortOrder(existing: number[]): number {
  return existing.length ? Math.max(...existing) + 10 : 10
}
