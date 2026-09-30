import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  summarisePacking,
  packLevelCbm,
  unitsPerContainer,
  calculateCostRow,
  mostExpensiveDestination,
  grossMargin,
  costModelName,
  formatAud,
  formatPercent
} from '../shared/utils/costModel.ts'
import type { CostFactors, CostRowInput, PackLevelInput } from '../shared/utils/costModel.ts'

const empty: PackLevelInput = { lengthCm: null, widthCm: null, heightCm: null, qtyInside: null }
const lvl = (l: number, w: number, h: number, qty: number): PackLevelInput =>
  ({ lengthCm: l, widthCm: w, heightCm: h, qtyInside: qty })

const close = (actual: number | null, expected: number, eps = 1e-9) => {
  assert.ok(actual !== null, `expected ${expected}, got null`)
  assert.ok(Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`)
}

/* ---- Navin's four packing examples ---- */

test('example 1: clamps 20/carton, 30 cartons/outer, 10 outers/pallet = 6000 per pallet', () => {
  const p = summarisePacking({
    carton: lvl(30, 20, 15, 20),
    outer: lvl(100, 60, 50, 30),
    pallet: lvl(120, 100, 150, 10)
  })
  assert.deepEqual(p.units, { carton: 20, outer: 600, pallet: 6000 })
  assert.equal(p.shippingLevel, 'pallet')
  assert.equal(p.shippingUnits, 6000)
  close(p.shippingCbm, 1.8)
  assert.deepEqual(p.issues, [])
})

test('example 2: furniture leg 1/carton, 10 cartons/outer, pallet = 1 outer (same size) = 10', () => {
  const p = summarisePacking({
    carton: lvl(80, 15, 15, 1),
    outer: lvl(80, 75, 30, 10),
    pallet: lvl(80, 75, 30, 1)
  })
  assert.deepEqual(p.units, { carton: 1, outer: 10, pallet: 10 })
  assert.equal(p.shippingLevel, 'pallet')
  assert.equal(p.shippingUnits, 10)
})

test('example 3: no carton, items straight on a pallet', () => {
  const p = summarisePacking({ carton: empty, outer: empty, pallet: lvl(120, 100, 100, 40) })
  assert.deepEqual(p.units, { carton: null, outer: null, pallet: 40 })
  assert.equal(p.shippingLevel, 'pallet')
  assert.equal(p.shippingUnits, 40)
  close(p.shippingCbm, 1.2)
})

test('example 4: brackets 30/carton, no outer, 100 cartons/pallet = 3000', () => {
  const p = summarisePacking({ carton: lvl(40, 30, 20, 30), outer: empty, pallet: lvl(120, 100, 120, 100) })
  assert.deepEqual(p.units, { carton: 30, outer: null, pallet: 3000 })
  assert.equal(p.shippingUnits, 3000)
})

/* ---- packing edge cases ---- */

test('shipping level falls back to outer, then carton', () => {
  assert.equal(summarisePacking({ carton: lvl(10, 10, 10, 5), outer: lvl(50, 50, 50, 8), pallet: empty }).shippingLevel, 'outer')
  assert.equal(summarisePacking({ carton: lvl(10, 10, 10, 5), outer: empty, pallet: empty }).shippingLevel, 'carton')
})

test('missing dimensions or qty are reported, not guessed', () => {
  const p = summarisePacking({ carton: { ...empty, lengthCm: 10, qtyInside: 5 }, outer: empty, pallet: empty })
  assert.equal(p.shippingCbm, null)
  assert.ok(p.issues.some(i => i.includes('length, width and height')))

  const q = summarisePacking({ carton: lvl(10, 10, 10, 0), outer: empty, pallet: empty })
  assert.equal(q.shippingUnits, null)
  assert.ok(q.issues.some(i => i.includes('quantity inside')))

  const none = summarisePacking({ carton: empty, outer: empty, pallet: empty })
  assert.equal(none.shippingLevel, null)
  assert.equal(none.issues.length, 1)
})

test('fractional qty inside is rejected', () => {
  const p = summarisePacking({ carton: lvl(10, 10, 10, 2.5), outer: empty, pallet: empty })
  assert.equal(p.shippingUnits, null)
  assert.ok(p.issues.some(i => i.includes('whole number')))
})

test('CBM from cm', () => {
  close(packLevelCbm(lvl(50, 40, 35, 1)), 0.07)
  assert.equal(packLevelCbm({ ...empty, lengthCm: 50, widthCm: 40 }), null)
})

test('units per container: whole cartons by volume x units each', () => {
  assert.equal(unitsPerContainer(0.07, 20, 28), 8000) // exactly 400 cartons, no float loss
  assert.equal(unitsPerContainer(0.07, 20, 68), 19420) // 971.4 -> 971 cartons
  assert.equal(unitsPerContainer(30, 5, 28), 0) // bigger than the container
  assert.equal(unitsPerContainer(null, 5, 28), null)
})

/* ---- costs, worked by hand ---- */

const factors: CostFactors = {
  usdToAud: 1.5,
  cnyToAud: 0.21,
  containerCbm: { c20: 28, c40hc: 68 },
  destinations: [
    // MEL: 20' = 1000*1.5 + 1500 = 3000; 40HC = 1800*1.5 + 2000 = 4700
    { port: 'MEL', freightUsd: { c20: 1000, c40hc: 1800 }, localAud: { c20: 1500, c40hc: 2000 } },
    // SYD: 20' = 1200*1.5 + 1400 = 3200; 40HC = 2000*1.5 + 1900 = 4900
    { port: 'SYD', freightUsd: { c20: 1200, c40hc: 2000 }, localAud: { c20: 1400, c40hc: 1900 } }
  ]
}

const row: CostRowInput = {
  carton: lvl(50, 40, 35, 20),
  outer: empty,
  pallet: empty,
  fobCurrency: 'USD',
  fobPrice: 2,
  toolingCost: 1000,
  dutyPercent: 5,
  buyerBuyPrice: 5,
  rrpIncGst: 11
}

test('most expensive port per container size', () => {
  assert.equal(mostExpensiveDestination(factors.destinations, 'c20', 1.5)?.port, 'SYD')
  assert.equal(mostExpensiveDestination([], 'c20', 1.5), null)
})

test('full row: COGS, duty, tooling, shipping, landed, margins (20\' basis)', () => {
  const r = calculateCostRow(row, factors, 'c20')
  assert.deepEqual(r.unitsPer, { c20: 8000, c40hc: 19420 })
  close(r.fobAud, 3)
  close(r.dutyAud, 0.15)
  close(r.netCogsAud, 3.15)
  close(r.toolingAud, 1500) // shown separately...
  close(r.shippingPerUnit.c20, 3200 / 8000) // ...not in unit cost
  close(r.shippingPerUnit.c40hc, 4900 / 19420)
  assert.deepEqual(r.shippingPort, { c20: 'SYD', c40hc: 'SYD' })
  close(r.landedByPort[0]!.landedAud, 3.15 + 3000 / 8000) // MEL 3.525
  close(r.landedByPort[1]!.landedAud, 3.55) // SYD
  close(r.landedAud, 3.55)
  assert.equal(r.landedPort, 'SYD')
  close(r.rapidMargin, (5 - 3.55) / 5) // 29%
  close(r.rrpExGst, 10)
  close(r.buyerMargin, 0.5)
  assert.deepEqual(r.issues, [])
})

test('40HC basis changes landed cost and margin', () => {
  const r = calculateCostRow(row, factors, 'c40hc')
  close(r.landedAud, 3.15 + 4900 / 19420)
  close(r.rapidMargin, (5 - (3.15 + 4900 / 19420)) / 5)
})

test('CNY row and blank duty (= 0%)', () => {
  const r = calculateCostRow({ ...row, fobCurrency: 'CNY', fobPrice: 10, dutyPercent: null, toolingCost: 5000 }, factors, 'c20')
  close(r.fobAud, 2.1)
  close(r.dutyAud, 0)
  close(r.netCogsAud, 2.1)
  close(r.toolingAud, 1050)
})

test('missing inputs give blanks, not wrong numbers', () => {
  const r = calculateCostRow({ ...row, fobPrice: null, buyerBuyPrice: null, rrpIncGst: null }, factors, 'c20')
  assert.equal(r.netCogsAud, null)
  assert.equal(r.landedAud, null)
  assert.equal(r.rapidMargin, null)
  assert.equal(r.rrpExGst, null)
  assert.equal(r.buyerMargin, null)
  assert.ok(r.shippingPerUnit.c20 !== null) // shipping still shows
  assert.ok(r.issues.includes('Enter the FOB price'))
})

test('item too big for a 20\' is flagged', () => {
  const r = calculateCostRow({ ...row, carton: lvl(600, 240, 240, 1) }, factors, 'c20') // 34.56 CBM
  assert.equal(r.unitsPer.c20, 0)
  assert.equal(r.shippingPerUnit.c20, null)
  assert.ok(r.issues.some(i => i.includes(`20'`)))
})

test('gross margin guards', () => {
  assert.equal(grossMargin(0, 1), null)
  assert.equal(grossMargin(null, 1), null)
  close(grossMargin(4, 5), -0.25) // loss shows as negative
})

/* ---- naming and display ---- */

test('model name: Category - Sub-category - Supplier - dd/mm/yyyy', () => {
  assert.equal(
    costModelName({ category: 'Hardware', subCategory: 'Clamps', supplier: 'Ningbo Tools Co', savedDate: '2026-09-30' }),
    'Hardware - Clamps - Ningbo Tools Co - 30/09/2026'
  )
  assert.equal(
    costModelName({ category: 'Furniture', subCategory: ' ', supplier: 'ABC', savedDate: '2026-01-05' }),
    'Furniture - ABC - 05/01/2026'
  )
})

test('display formats', () => {
  assert.equal(formatAud(1234.5), '1,234.50')
  assert.equal(formatAud(null), '—')
  assert.equal(formatPercent(0.29), '29.0%')
  assert.equal(formatPercent(null), '—')
})
