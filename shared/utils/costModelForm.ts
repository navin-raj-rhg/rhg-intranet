/**
 * Pure helpers for the new-cost-model form (Step 11.8b). Every cell is text
 * while typing; these turn a row into the numbers the maths and the API use,
 * and list anything that would stop the model being saved.
 *
 * Blocking (can't save): something that isn't a number, a negative, a
 * fractional "qty inside", duty over 100%. NOT blocking: blanks - a model can
 * be saved with, say, no RRP yet; the figures just show "—" and a warning.
 */

import type { CostCurrency, CostRowInput, PackLevelInput, PackLevelKey } from './costModel.ts'
import { PACK_LEVEL_LABELS, costModelRowProblems, costRowHasContent } from './costModel.ts'

export interface FormPackLevel {
  l: string
  w: string
  h: string
  qty: string
}

export interface CostFormRow {
  /** Stable key for Vue lists (not saved). */
  key: number
  productNo: string
  description: string
  carton: FormPackLevel
  outer: FormPackLevel
  pallet: FormPackLevel
  fobCurrency: CostCurrency
  fobPrice: string
  toolingCost: string
  dutyPercent: string
  buyerBuyPrice: string
  rrpIncGst: string
  /** Where empty cells were filled from (Step 11.8d; shown on the row, not saved). */
  filledFrom?: string
}

export type FormNumberField = 'fobPrice' | 'toolingCost' | 'dutyPercent' | 'buyerBuyPrice' | 'rrpIncGst'

const FIELD_LABELS: Record<FormNumberField, string> = {
  fobPrice: 'FOB price',
  toolingCost: 'Tooling cost',
  dutyPercent: 'Duty %',
  buyerBuyPrice: 'Buyer buy price',
  rrpIncGst: 'RRP'
}

const emptyLevel = (): FormPackLevel => ({ l: '', w: '', h: '', qty: '' })

export function emptyCostFormRow(key: number, fobCurrency: CostCurrency = 'USD'): CostFormRow {
  return {
    key,
    productNo: '',
    description: '',
    carton: emptyLevel(),
    outer: emptyLevel(),
    pallet: emptyLevel(),
    fobCurrency,
    fobPrice: '',
    toolingCost: '',
    dutyPercent: '',
    buyerBuyPrice: '',
    rrpIncGst: ''
  }
}

/** '' -> null; '1,250.5' -> 1250.5; anything else that isn't a number -> NaN. */
export function parseFormNumber(text: string): number | null {
  const t = text.trim().replace(/,/g, '').replace(/^\$/, '').replace(/%$/, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : Number.NaN
}

export interface ParsedFormRow {
  input: CostRowInput & { productNo: string | null, description: string | null }
  /** Field paths with a blocking problem, e.g. 'carton.qty', 'fobPrice'. */
  badFields: string[]
  /** Plain messages for those problems. */
  problems: string[]
}

export function parseCostFormRow(row: CostFormRow): ParsedFormRow {
  const badFields: string[] = []
  const problems: string[] = []
  const bad = (field: string, message: string) => {
    badFields.push(field)
    problems.push(message)
  }

  const level = (key: PackLevelKey): PackLevelInput => {
    const r = row[key]
    const label = PACK_LEVEL_LABELS[key]
    const dim = (part: 'l' | 'w' | 'h', name: string) => {
      const n = parseFormNumber(r[part])
      if (n === null) return null
      if (Number.isNaN(n)) bad(`${key}.${part}`, `${label} ${name} isn't a number`)
      else if (n <= 0) bad(`${key}.${part}`, `${label} ${name} must be more than 0`)
      else return n
      return null
    }
    const q = parseFormNumber(r.qty)
    let qtyInside: number | null = null
    if (q !== null) {
      if (Number.isNaN(q)) bad(`${key}.qty`, `${label} qty isn't a number`)
      else if (q <= 0) bad(`${key}.qty`, `${label} qty must be more than 0`)
      else if (!Number.isInteger(q)) bad(`${key}.qty`, `${label} qty must be a whole number`)
      else qtyInside = q
    }
    return { lengthCm: dim('l', 'length'), widthCm: dim('w', 'width'), heightCm: dim('h', 'height'), qtyInside }
  }

  const money = (field: FormNumberField, max?: number): number | null => {
    const n = parseFormNumber(row[field])
    if (n === null) return null
    if (Number.isNaN(n)) bad(field, `${FIELD_LABELS[field]} isn't a number`)
    else if (n < 0) bad(field, `${FIELD_LABELS[field]} can't be negative`)
    else if (max !== undefined && n > max) bad(field, `${FIELD_LABELS[field]} can't be over ${max}`)
    else return n
    return null
  }

  const input = {
    productNo: row.productNo.trim() || null,
    description: row.description.trim() || null,
    carton: level('carton'),
    outer: level('outer'),
    pallet: level('pallet'),
    fobCurrency: row.fobCurrency,
    fobPrice: money('fobPrice'),
    toolingCost: money('toolingCost'),
    dutyPercent: money('dutyPercent', 100),
    buyerBuyPrice: money('buyerBuyPrice'),
    rrpIncGst: money('rrpIncGst')
  }
  return { input, badFields, problems }
}

/** True if nothing at all has been typed in the row (currency alone doesn't count). */
export function costFormRowIsBlank(row: CostFormRow): boolean {
  const texts = [
    row.productNo, row.description, row.fobPrice, row.toolingCost, row.dutyPercent, row.buyerBuyPrice, row.rrpIncGst,
    ...(['carton', 'outer', 'pallet'] as const).flatMap(k => [row[k].l, row[k].w, row[k].h, row[k].qty])
  ]
  return texts.every(t => t.trim() === '')
}

export interface CostFormHeader {
  supplierName: string
  categoryId: number | null
  originPortId: number | null
}

/** Everything that stops Save, as plain sentences (row problems prefixed "Row n:"). */
export function costFormProblems(header: CostFormHeader, rows: CostFormRow[]): string[] {
  const list: string[] = []
  if (!header.supplierName.trim()) list.push('Enter the supplier name')
  if (!header.originPortId) list.push('Choose a ship-from port')
  if (!header.categoryId) list.push('Choose a category')

  const parsed = rows.map(parseCostFormRow)
  parsed.forEach((p, i) => {
    if (!costFormRowIsBlank(rows[i]!)) p.problems.forEach(m => list.push(`Row ${i + 1}: ${m}`))
  })
  // Same rules the server applies (at least one product; each needs a label).
  const inputs = parsed.map((p, i) => (costFormRowIsBlank(rows[i]!) ? null : p.input))
  for (const m of costModelRowProblems(inputs.map(r => r ?? blankInput))) list.push(m)
  return list
}

const blankInput: CostRowInput = {
  carton: { lengthCm: null, widthCm: null, heightCm: null, qtyInside: null },
  outer: { lengthCm: null, widthCm: null, heightCm: null, qtyInside: null },
  pallet: { lengthCm: null, widthCm: null, heightCm: null, qtyInside: null },
  fobCurrency: 'USD',
  fobPrice: null,
  toolingCost: null,
  dutyPercent: null,
  buyerBuyPrice: null,
  rrpIncGst: null
}

/** Rows to send to the API: typed rows only, in order. */
export function costFormRowsForSave(rows: CostFormRow[]) {
  return rows
    .filter(r => !costFormRowIsBlank(r))
    .map(r => parseCostFormRow(r).input)
    .filter(costRowHasContent)
}

/** A saved row back into form text (for Duplicate). */
export function costFormRowFromSaved(key: number, saved: CostRowInput & { productNo: string | null, description: string | null }): CostFormRow {
  const s = (n: number | null) => (n === null ? '' : String(n))
  const lvl = (l: PackLevelInput): FormPackLevel => ({ l: s(l.lengthCm), w: s(l.widthCm), h: s(l.heightCm), qty: s(l.qtyInside) })
  return {
    key,
    productNo: saved.productNo ?? '',
    description: saved.description ?? '',
    carton: lvl(saved.carton),
    outer: lvl(saved.outer),
    pallet: lvl(saved.pallet),
    fobCurrency: saved.fobCurrency,
    fobPrice: s(saved.fobPrice),
    toolingCost: s(saved.toolingCost),
    dutyPercent: s(saved.dutyPercent),
    buyerBuyPrice: s(saved.buyerBuyPrice),
    rrpIncGst: s(saved.rrpIncGst)
  }
}

/**
 * Fills a row's EMPTY cells from a previously saved product (Step 11.8d);
 * anything already typed is kept. The currency is taken from the saved product
 * only while the FOB price is still empty (so it always matches that price).
 * Returns the updated row and how many cells were filled.
 */
export function fillEmptyCostFormCells(
  row: CostFormRow,
  saved: CostRowInput & { productNo: string | null, description: string | null },
  source: string
): { row: CostFormRow, filled: number } {
  const from = costFormRowFromSaved(row.key, saved)
  // Copied by hand (not structuredClone): the form's rows are Vue reactive
  // proxies, which structuredClone refuses to copy.
  const next: CostFormRow = { ...row, carton: { ...row.carton }, outer: { ...row.outer }, pallet: { ...row.pallet } }
  let filled = 0

  // Plain text cells, then the packing cells, then the price cells.
  const textFields = ['productNo', 'description', 'fobPrice', 'toolingCost', 'dutyPercent', 'buyerBuyPrice', 'rrpIncGst'] as const

  if (next.fobPrice.trim() === '' && from.fobPrice.trim() !== '') next.fobCurrency = from.fobCurrency
  for (const f of textFields) {
    if (next[f].trim() === '' && from[f].trim() !== '') {
      next[f] = from[f]
      filled++
    }
  }
  for (const k of ['carton', 'outer', 'pallet'] as const) {
    for (const f of ['l', 'w', 'h', 'qty'] as const) {
      if (next[k][f].trim() === '' && from[k][f].trim() !== '') {
        next[k][f] = from[k][f]
        filled++
      }
    }
  }
  if (filled > 0) next.filledFrom = source
  return { row: next, filled }
}
