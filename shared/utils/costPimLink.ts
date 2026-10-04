/**
 * Links Cost Modelling to Product Information (Step 20.3). Pure logic (no DB,
 * no Vue) shared by the server and the cost model form.
 *
 * - A product number typed in a cost model is looked up in the PIM.
 * - If it is there, its description and packaging fill the row's EMPTY cells
 *   and any difference is only flagged - the PIM is never changed from here.
 * - If it is not there, a Draft product is created in the PIM when the cost
 *   model is saved (see `pimDraftFromCostRow`).
 */

import type { CostModelRowInput } from '../types/costModelling.ts'
import type { PackLevelInput, PackLevelKey } from './costModel.ts'
import { PACK_LEVEL_LABELS } from './costModel.ts'

const LEVELS: PackLevelKey[] = ['carton', 'outer', 'pallet']

/** The part of a PIM product the cost model cares about. */
export interface PimProductLink {
  name: string
  packaging: {
    level: PackLevelKey
    lengthCm: string | number | null
    widthCm: string | number | null
    heightCm: string | number | null
    qtyInside: number | null
  }[]
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Product numbers match ignoring case and extra spaces, as in the PIM. */
export function costProductNoKey(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

const emptyLevel = (): PackLevelInput => ({ lengthCm: null, widthCm: null, heightCm: null, qtyInside: null })

/**
 * A row's inputs as the PIM knows them: the PIM's description and packaging
 * laid over `base` (an earlier cost of the same product, or nothing). The PIM
 * wins where it has a value; prices only ever come from `base`.
 */
export function costInputFromPim(base: CostModelRowInput | null, productNo: string, pim: PimProductLink): CostModelRowInput {
  const start: CostModelRowInput = base
    ? { ...base, carton: { ...base.carton }, outer: { ...base.outer }, pallet: { ...base.pallet } }
    : {
        productNo,
        description: null,
        carton: emptyLevel(),
        outer: emptyLevel(),
        pallet: emptyLevel(),
        fobCurrency: 'USD',
        fobPrice: null,
        toolingCost: null,
        dutyPercent: null,
        buyerBuyPrice: null,
        rrpIncGst: null
      }
  start.productNo = productNo
  if (pim.name.trim()) start.description = pim.name.trim()
  for (const p of pim.packaging) {
    const level = start[p.level]
    level.lengthCm = num(p.lengthCm) ?? level.lengthCm
    level.widthCm = num(p.widthCm) ?? level.widthCm
    level.heightCm = num(p.heightCm) ?? level.heightCm
    level.qtyInside = p.qtyInside ?? level.qtyInside
  }
  return start
}

/**
 * Plain-English list of where a cost model row disagrees with the PIM, e.g.
 * "Carton length: 30 here, 32 in PIM". Only values present on BOTH sides are
 * compared (a blank is not a difference). Used for the "Differs from PIM" note.
 */
export function pimDifferences(
  row: { description: string | null, carton: PackLevelInput, outer: PackLevelInput, pallet: PackLevelInput },
  pim: PimProductLink
): string[] {
  const out: string[] = []
  const typed = (row.description ?? '').replace(/\s+/g, ' ').trim()
  const pimName = pim.name.replace(/\s+/g, ' ').trim()
  if (typed && pimName && typed.toLowerCase() !== pimName.toLowerCase()) {
    out.push(`Description: "${typed}" here, "${pimName}" in PIM`)
  }
  const fields = [['lengthCm', 'length'], ['widthCm', 'width'], ['heightCm', 'height'], ['qtyInside', 'qty inside']] as const
  for (const level of LEVELS) {
    const p = pim.packaging.find(x => x.level === level)
    if (!p) continue
    for (const [key, label] of fields) {
      const here = num(row[level][key])
      const there = num(p[key])
      if (here !== null && there !== null && here !== there) {
        out.push(`${PACK_LEVEL_LABELS[level]} ${label}: ${here} here, ${there} in PIM`)
      }
    }
  }
  return out
}

/** What a new PIM product is built from: one cost model row plus the model's header. */
export interface PimDraft {
  productNo: string
  name: string
  supplierName: string
  categoryName: string
  subCategoryName: string | null
  packaging: { level: PackLevelKey, lengthCm: number | null, widthCm: number | null, heightCm: number | null, qtyInside: number | null }[]
}

export interface PimDraftHeader {
  supplierName: string
  categoryName: string
  subCategoryName: string | null
}

/**
 * The Draft PIM product to create for a cost model row. Takes the product
 * number, description (or the number if there is none), the model's supplier,
 * category and sub-category, and any packaging typed. Never the FOB price or
 * RRP - those are costs and selling prices, not catalogue data. Null when the
 * row has no product number.
 */
export function pimDraftFromCostRow(row: CostModelRowInput, header: PimDraftHeader): PimDraft | null {
  const productNo = (row.productNo ?? '').replace(/\s+/g, ' ').trim()
  if (!productNo) return null
  const description = (row.description ?? '').replace(/\s+/g, ' ').trim()
  return {
    productNo,
    name: description || productNo,
    supplierName: header.supplierName,
    categoryName: header.categoryName,
    subCategoryName: header.subCategoryName,
    packaging: LEVELS
      .map(level => ({ level, ...row[level] }))
      .filter(p => [p.lengthCm, p.widthCm, p.heightCm, p.qtyInside].some(v => v !== null))
  }
}

/** The drafts for a whole model, one per product number (the first row wins when a number repeats). */
export function pimDraftsFromCostRows(rows: CostModelRowInput[], header: PimDraftHeader): PimDraft[] {
  const seen = new Set<string>()
  const out: PimDraft[] = []
  for (const row of rows) {
    const draft = pimDraftFromCostRow(row, header)
    if (!draft) continue
    const key = costProductNoKey(draft.productNo)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(draft)
  }
  return out
}
