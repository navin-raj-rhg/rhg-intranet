/**
 * Pure Cost Modelling maths (Step 11.2). No database and no Vue, so the same
 * code runs in the Cost Model table (live figures while typing), in the API
 * (the figures stored when a model is saved) and in the tests.
 *
 * Money: FOB and tooling are in the row's currency (USD or CNY); freight is
 * USD per container; port local costs are AUD per container. Everything the
 * screen shows as "AUD" is converted with the exchange rates in Factors.
 *
 * Nothing here rounds. Round only when displaying (formatAud / formatPercent).
 */

import { formatDateMY } from './dates.ts'

export type CostCurrency = 'USD' | 'CNY'
export type ContainerSize = 'c20' | 'c40hc'
export type PackLevelKey = 'carton' | 'outer' | 'pallet'

export const COST_CURRENCIES: CostCurrency[] = ['USD', 'CNY']
export const CONTAINER_LABELS: Record<ContainerSize, string> = { c20: `20'`, c40hc: '40HC' }
export const PACK_LEVEL_LABELS: Record<PackLevelKey, string> = {
  carton: 'Carton',
  outer: 'Outer carton',
  pallet: 'Pallet'
}
export const GST_RATE = 0.1

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface PackLevelInput {
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  /**
   * What is DIRECTLY inside this level:
   * carton = units; outer = cartons (or units if no carton);
   * pallet = outers (or cartons if no outer, or units if neither).
   */
  qtyInside: number | null
}

export interface CostRowInput {
  carton: PackLevelInput
  outer: PackLevelInput
  pallet: PackLevelInput
  fobCurrency: CostCurrency
  fobPrice: number | null
  /** One-off, same currency as FOB. Shown separately, never in unit cost. */
  toolingCost: number | null
  /** Blank = 0%. Charged on the FOB value in AUD. */
  dutyPercent: number | null
  /** AUD. */
  buyerBuyPrice: number | null
  /** AUD, including GST. */
  rrpIncGst: number | null
}

/** The Factor values a calculation uses (and a saved model keeps a copy of). */
export interface CostFactors {
  /** 1 USD = usdToAud AUD; 1 CNY = cnyToAud AUD. */
  usdToAud: number
  cnyToAud: number
  containerCbm: Record<ContainerSize, number>
  /** One entry per AU destination port, for the model's ship-from port. */
  destinations: DestinationCost[]
}

/**
 * The copy of Factors stored with a saved model (cost_models.factors_snapshot),
 * so the model shows exactly what it showed on the day it was saved.
 */
export interface CostFactorsSnapshot extends CostFactors {
  originPort: { code: string, name: string }
  /** Local-cost lines behind each destination's localAud total. */
  localFees: { port: string, fee: string, aud: Record<ContainerSize, number> }[]
  /** ISO timestamp the snapshot was taken. */
  capturedAt: string
}

export interface DestinationCost {
  /** e.g. 'MEL'. */
  port: string
  freightUsd: Record<ContainerSize, number>
  /** Sum of that port's local costs, AUD per container. */
  localAud: Record<ContainerSize, number>
}

/* ------------------------------------------------------------------ */
/* Packing                                                             */
/* ------------------------------------------------------------------ */

const positive = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0

/** A level is "used" once any of its dimensions or its qty is filled in. */
export function packLevelUsed(level: PackLevelInput): boolean {
  return [level.lengthCm, level.widthCm, level.heightCm, level.qtyInside]
    .some(v => v !== null && v !== undefined)
}

/** L x W x H in cm -> cubic metres; null until all three are > 0. */
export function packLevelCbm(level: PackLevelInput): number | null {
  const { lengthCm: l, widthCm: w, heightCm: h } = level
  if (!positive(l) || !positive(w) || !positive(h)) return null
  return (l * w * h) / 1_000_000
}

export interface PackSummary {
  /** Units held by each used level (null = level not used or incomplete). */
  units: Record<PackLevelKey, number | null>
  cbm: Record<PackLevelKey, number | null>
  /** The level loaded into the container: pallet, else outer, else carton. */
  shippingLevel: PackLevelKey | null
  shippingCbm: number | null
  shippingUnits: number | null
  issues: string[]
}

export function summarisePacking(row: Pick<CostRowInput, 'carton' | 'outer' | 'pallet'>): PackSummary {
  const levels: PackLevelKey[] = ['carton', 'outer', 'pallet']
  const units: Record<PackLevelKey, number | null> = { carton: null, outer: null, pallet: null }
  const cbm: Record<PackLevelKey, number | null> = { carton: null, outer: null, pallet: null }
  const issues: string[] = []

  // Units carried by the nearest used level below; 1 = loose units.
  let unitsBelow: number | null = 1
  for (const key of levels) {
    const level = row[key]
    if (!packLevelUsed(level)) continue
    const label = PACK_LEVEL_LABELS[key]
    cbm[key] = packLevelCbm(level)
    if (cbm[key] === null) issues.push(`${label}: enter length, width and height`)
    if (!positive(level.qtyInside)) {
      issues.push(`${label}: enter the quantity inside`)
      unitsBelow = null
    } else if (!Number.isInteger(level.qtyInside)) {
      issues.push(`${label}: quantity inside must be a whole number`)
      unitsBelow = null
    } else if (unitsBelow !== null) {
      unitsBelow = level.qtyInside * unitsBelow
    }
    units[key] = unitsBelow
  }

  const shippingLevel = [...levels].reverse().find(k => packLevelUsed(row[k])) ?? null
  if (!shippingLevel) issues.push('Enter carton, outer carton or pallet details')

  return {
    units,
    cbm,
    shippingLevel,
    shippingCbm: shippingLevel ? cbm[shippingLevel] : null,
    shippingUnits: shippingLevel ? units[shippingLevel] : null,
    issues
  }
}

/**
 * Whole shipping cartons/pallets that fit by volume x units in each.
 * Weight limits and stacking are not considered.
 */
export function unitsPerContainer(
  shippingCbm: number | null,
  shippingUnits: number | null,
  containerCbm: number
): number | null {
  if (!positive(shippingCbm) || !positive(shippingUnits) || !positive(containerCbm)) return null
  // Tiny epsilon so e.g. 28 / 0.28 isn't floored to 99 by float error.
  return Math.floor(containerCbm / shippingCbm + 1e-9) * shippingUnits
}

/* ------------------------------------------------------------------ */
/* Costs and margins                                                   */
/* ------------------------------------------------------------------ */

export function toAud(amount: number, currency: CostCurrency, f: Pick<CostFactors, 'usdToAud' | 'cnyToAud'>): number {
  return amount * (currency === 'USD' ? f.usdToAud : f.cnyToAud)
}

/** Freight (USD -> AUD) + local costs (AUD), per container. */
export function containerCostAud(dest: DestinationCost, size: ContainerSize, usdToAud: number): number {
  return dest.freightUsd[size] * usdToAud + dest.localAud[size]
}

/** The most expensive destination for a container size (first one wins a tie). */
export function mostExpensiveDestination(
  destinations: DestinationCost[],
  size: ContainerSize,
  usdToAud: number
): DestinationCost | null {
  let worst: DestinationCost | null = null
  for (const d of destinations) {
    if (!worst || containerCostAud(d, size, usdToAud) > containerCostAud(worst, size, usdToAud)) worst = d
  }
  return worst
}

/** (price - cost) / price, as a fraction; null when price isn't > 0. */
export function grossMargin(price: number | null, cost: number | null): number | null {
  if (!positive(price) || cost === null || !Number.isFinite(cost)) return null
  return (price - cost) / price
}

export interface CostRowResult {
  packing: PackSummary
  unitsPer: Record<ContainerSize, number | null>
  fobAud: number | null
  dutyAud: number | null
  /** FOB in AUD + duty. */
  netCogsAud: number | null
  toolingAud: number | null
  /** Shipping per unit using the most expensive AU port, per container size. */
  shippingPerUnit: Record<ContainerSize, number | null>
  /** Port used for shippingPerUnit, per container size. */
  shippingPort: Record<ContainerSize, string | null>
  /** Landed cost (AUD) at each AU port, for the model's chosen container size. */
  landedByPort: { port: string, landedAud: number | null }[]
  /** Highest of landedByPort - what the margins use. */
  landedAud: number | null
  landedPort: string | null
  rapidMargin: number | null
  rrpExGst: number | null
  buyerMargin: number | null
  issues: string[]
}

export function calculateCostRow(row: CostRowInput, f: CostFactors, basis: ContainerSize): CostRowResult {
  const packing = summarisePacking(row)
  const issues = [...packing.issues]

  const unitsPer: Record<ContainerSize, number | null> = {
    c20: unitsPerContainer(packing.shippingCbm, packing.shippingUnits, f.containerCbm.c20),
    c40hc: unitsPerContainer(packing.shippingCbm, packing.shippingUnits, f.containerCbm.c40hc)
  }
  if (packing.shippingCbm !== null && packing.shippingUnits !== null) {
    for (const size of ['c20', 'c40hc'] as const) {
      if (unitsPer[size] === 0) issues.push(`Doesn't fit a ${CONTAINER_LABELS[size]} container`)
    }
  }

  const duty = row.dutyPercent ?? 0
  if (duty < 0) issues.push('Duty % cannot be negative')
  const fobAud = row.fobPrice !== null && row.fobPrice >= 0 ? toAud(row.fobPrice, row.fobCurrency, f) : null
  if (row.fobPrice === null) issues.push('Enter the FOB price')
  const dutyAud = fobAud !== null ? fobAud * (Math.max(duty, 0) / 100) : null
  const netCogsAud = fobAud !== null && dutyAud !== null ? fobAud + dutyAud : null
  const toolingAud = row.toolingCost !== null && row.toolingCost >= 0
    ? toAud(row.toolingCost, row.fobCurrency, f)
    : null

  const perUnitAt = (d: DestinationCost, size: ContainerSize): number | null => {
    const units = unitsPer[size]
    return positive(units) ? containerCostAud(d, size, f.usdToAud) / units : null
  }

  const shippingPerUnit: Record<ContainerSize, number | null> = { c20: null, c40hc: null }
  const shippingPort: Record<ContainerSize, string | null> = { c20: null, c40hc: null }
  for (const size of ['c20', 'c40hc'] as const) {
    const worst = mostExpensiveDestination(f.destinations, size, f.usdToAud)
    shippingPort[size] = worst?.port ?? null
    shippingPerUnit[size] = worst ? perUnitAt(worst, size) : null
  }

  const landedByPort = f.destinations.map((d) => {
    const ship = perUnitAt(d, basis)
    return { port: d.port, landedAud: netCogsAud !== null && ship !== null ? netCogsAud + ship : null }
  })
  let landedAud: number | null = null
  let landedPort: string | null = null
  for (const l of landedByPort) {
    if (l.landedAud !== null && (landedAud === null || l.landedAud > landedAud)) {
      landedAud = l.landedAud
      landedPort = l.port
    }
  }

  const rrpExGst = positive(row.rrpIncGst) ? row.rrpIncGst / (1 + GST_RATE) : null

  return {
    packing,
    unitsPer,
    fobAud,
    dutyAud,
    netCogsAud,
    toolingAud,
    shippingPerUnit,
    shippingPort,
    landedByPort,
    landedAud,
    landedPort,
    rapidMargin: grossMargin(row.buyerBuyPrice, landedAud),
    rrpExGst,
    buyerMargin: grossMargin(rrpExGst, row.buyerBuyPrice),
    issues
  }
}

/* ------------------------------------------------------------------ */
/* Naming and display                                                  */
/* ------------------------------------------------------------------ */

/** "Category - Sub-category - Supplier - dd/mm/yyyy" (sub-category skipped if blank). */
export function costModelName(p: {
  category: string
  subCategory?: string | null
  supplier: string
  savedDate: string
}): string {
  return [p.category, p.subCategory, p.supplier, formatDateMY(p.savedDate)]
    .map(s => (s ?? '').trim())
    .filter(Boolean)
    .join(' - ')
}

export function formatAud(n: number | null, decimals = 2): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatPercent(fraction: number | null, decimals = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(decimals)}%`
}

export function formatCbm(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return n.toFixed(4)
}
