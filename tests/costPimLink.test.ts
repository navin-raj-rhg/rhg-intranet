import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  costInputFromPim,
  costProductNoKey,
  pimDifferences,
  pimDraftFromCostRow,
  pimDraftsFromCostRows
} from '../shared/utils/costPimLink.ts'
import type { CostModelRowInput } from '../shared/types/costModelling.ts'

const level = (l: number | null, w: number | null, h: number | null, qty: number | null) => ({ lengthCm: l, widthCm: w, heightCm: h, qtyInside: qty })

const row = (over: Partial<CostModelRowInput> = {}): CostModelRowInput => ({
  productNo: 'CL-100',
  description: 'Clamp',
  carton: level(30, 20, 10, 12),
  outer: level(null, null, null, null),
  pallet: level(null, null, null, null),
  fobCurrency: 'USD',
  fobPrice: 2.5,
  toolingCost: null,
  dutyPercent: 5,
  buyerBuyPrice: null,
  rrpIncGst: 9.9,
  ...over
})

const header = { supplierName: 'Acme Ltd', categoryName: 'Hand tools', subCategoryName: 'Clamps' }

test('product numbers match ignoring case and spacing', () => {
  assert.equal(costProductNoKey('  cl  -100 '), 'cl -100')
  assert.equal(costProductNoKey('CL-100'), costProductNoKey(' cl-100'))
  assert.equal(costProductNoKey(null), '')
})

test('a PIM product with no earlier cost gives description and packaging only', () => {
  const input = costInputFromPim(null, 'CL-100', {
    name: 'Bar clamp',
    packaging: [{ level: 'carton', lengthCm: '31.00', widthCm: '21.50', heightCm: null, qtyInside: 6 }]
  })
  assert.equal(input.description, 'Bar clamp')
  assert.deepEqual(input.carton, { lengthCm: 31, widthCm: 21.5, heightCm: null, qtyInside: 6 })
  assert.equal(input.fobPrice, null)
  assert.equal(input.rrpIncGst, null)
})

test('the PIM wins over an earlier cost for description and size, but prices stay from the cost', () => {
  const input = costInputFromPim(row(), 'CL-100', {
    name: 'Bar clamp',
    packaging: [{ level: 'carton', lengthCm: '32', widthCm: null, heightCm: null, qtyInside: null }]
  })
  assert.equal(input.description, 'Bar clamp')
  assert.equal(input.carton.lengthCm, 32)
  assert.equal(input.carton.widthCm, 20) // PIM blank -> keeps the earlier cost
  assert.equal(input.fobPrice, 2.5)
})

test('costInputFromPim does not change the earlier cost it was given', () => {
  const base = row()
  costInputFromPim(base, 'CL-100', { name: 'X', packaging: [{ level: 'carton', lengthCm: 99, widthCm: 99, heightCm: 99, qtyInside: 99 }] })
  assert.equal(base.carton.lengthCm, 30)
})

test('differences are listed only where both sides have a value and they disagree', () => {
  const diffs = pimDifferences(row(), {
    name: 'clamp',
    packaging: [
      { level: 'carton', lengthCm: '32', widthCm: '20.00', heightCm: null, qtyInside: 12 },
      { level: 'pallet', lengthCm: 120, widthCm: 100, heightCm: 150, qtyInside: 40 }
    ]
  })
  assert.deepEqual(diffs, ['Carton length: 30 here, 32 in PIM'])
})

test('a different description is flagged, a different case is not', () => {
  const pim = { name: 'Bar clamp', packaging: [] }
  assert.equal(pimDifferences(row({ description: 'bar CLAMP' }), pim).length, 0)
  assert.equal(pimDifferences(row({ description: 'Clamp' }), pim).length, 1)
  assert.equal(pimDifferences(row({ description: null }), pim).length, 0)
})

test('a PIM draft takes the header and typed packaging, never prices', () => {
  const draft = pimDraftFromCostRow(row(), header)!
  assert.equal(draft.productNo, 'CL-100')
  assert.equal(draft.name, 'Clamp')
  assert.equal(draft.supplierName, 'Acme Ltd')
  assert.equal(draft.subCategoryName, 'Clamps')
  assert.deepEqual(draft.packaging, [{ level: 'carton', lengthCm: 30, widthCm: 20, heightCm: 10, qtyInside: 12 }])
  assert.equal('fobPrice' in draft, false)
})

test('a draft with no description is named after its product number; no number means no draft', () => {
  assert.equal(pimDraftFromCostRow(row({ description: '  ' }), header)!.name, 'CL-100')
  assert.equal(pimDraftFromCostRow(row({ productNo: '  ' }), header), null)
  assert.equal(pimDraftFromCostRow(row({ productNo: null }), header), null)
})

test('one draft per product number, first row wins', () => {
  const drafts = pimDraftsFromCostRows(
    [row(), row({ productNo: 'cl-100', description: 'Second' }), row({ productNo: 'CL-200', description: 'Other' }), row({ productNo: '' })],
    header
  )
  assert.deepEqual(drafts.map(d => d.productNo), ['CL-100', 'CL-200'])
  assert.equal(drafts[0]!.name, 'Clamp')
})
