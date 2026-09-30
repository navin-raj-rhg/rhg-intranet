import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  costFormProblems,
  costFormRowFromSaved,
  costFormRowIsBlank,
  costFormRowsForSave,
  emptyCostFormRow,
  parseCostFormRow,
  parseFormNumber
} from '../shared/utils/costModelForm.ts'
import type { CostFormRow } from '../shared/utils/costModelForm.ts'

const filled = (over: Partial<CostFormRow> = {}): CostFormRow => ({
  ...emptyCostFormRow(1),
  productNo: 'CL-100',
  description: 'G-clamp',
  carton: { l: '50', w: '40', h: '35', qty: '20' },
  fobPrice: '2',
  toolingCost: '1,000',
  dutyPercent: '5%',
  buyerBuyPrice: '$5',
  rrpIncGst: '11',
  ...over
})
const header = { supplierName: 'Ningbo Tools', categoryId: 1, originPortId: 1 }

test('numbers: blanks, commas, $ and % are fine; words are not', () => {
  assert.equal(parseFormNumber(''), null)
  assert.equal(parseFormNumber(' 1,250.5 '), 1250.5)
  assert.equal(parseFormNumber('$5'), 5)
  assert.equal(parseFormNumber('5%'), 5)
  assert.ok(Number.isNaN(parseFormNumber('abc')))
})

test('a filled row parses into the numbers the maths uses', () => {
  const p = parseCostFormRow(filled())
  assert.deepEqual(p.problems, [])
  assert.deepEqual(p.input.carton, { lengthCm: 50, widthCm: 40, heightCm: 35, qtyInside: 20 })
  assert.equal(p.input.toolingCost, 1000)
  assert.equal(p.input.dutyPercent, 5)
  assert.equal(p.input.buyerBuyPrice, 5)
  assert.equal(p.input.outer.lengthCm, null)
})

test('bad cells are flagged by field with plain messages', () => {
  const p = parseCostFormRow(filled({
    carton: { l: '50', w: 'x', h: '0', qty: '2.5' },
    fobPrice: '-1',
    dutyPercent: '150'
  }))
  assert.deepEqual(p.badFields.sort(), ['carton.h', 'carton.qty', 'carton.w', 'dutyPercent', 'fobPrice'])
  assert.ok(p.problems.includes('Carton qty must be a whole number'))
  assert.ok(p.problems.includes('Carton width isn\'t a number'))
  assert.ok(p.problems.includes('FOB price can\'t be negative'))
  assert.ok(p.problems.includes('Duty % can\'t be over 100'))
})

test('blank rows are ignored; currency alone is still blank', () => {
  assert.ok(costFormRowIsBlank(emptyCostFormRow(1, 'CNY')))
  assert.ok(!costFormRowIsBlank({ ...emptyCostFormRow(1), fobPrice: '0' }))
  assert.equal(costFormRowsForSave([emptyCostFormRow(1), filled(), emptyCostFormRow(3)]).length, 1)
})

test('form problems: header, row cells and the server rules', () => {
  assert.deepEqual(costFormProblems(header, [filled(), emptyCostFormRow(2)]), [])
  assert.deepEqual(
    costFormProblems({ supplierName: ' ', categoryId: null, originPortId: null }, [emptyCostFormRow(1)]),
    ['Enter the supplier name', 'Choose a ship-from port', 'Choose a category', 'Add at least one product']
  )
  const list = costFormProblems(header, [filled(), filled({ productNo: '', description: '', fobPrice: 'abc' })])
  assert.deepEqual(list, ['Row 2: FOB price isn\'t a number', 'Row 2: enter a product no. or description'])
  // A blank row in the middle keeps later rows' numbering honest
  assert.deepEqual(costFormProblems(header, [emptyCostFormRow(1), filled({ fobPrice: 'x' })]), ['Row 2: FOB price isn\'t a number'])
})

test('missing figures are NOT blocking (e.g. no RRP yet)', () => {
  assert.deepEqual(costFormProblems(header, [filled({ rrpIncGst: '', buyerBuyPrice: '', fobPrice: '' })]), [])
})

test('saved row round-trips back into the form (for Duplicate)', () => {
  const input = parseCostFormRow(filled({ outer: { l: '100', w: '60', h: '50', qty: '30' } })).input
  const back = costFormRowFromSaved(9, input)
  assert.equal(back.key, 9)
  assert.deepEqual(back.carton, { l: '50', w: '40', h: '35', qty: '20' })
  assert.deepEqual(back.outer, { l: '100', w: '60', h: '50', qty: '30' })
  assert.equal(back.pallet.l, '')
  assert.equal(back.toolingCost, '1000')
  assert.deepEqual(parseCostFormRow(back).input, input)
})

test('filling from a saved product only fills empty cells', async () => {
  const { fillEmptyCostFormCells } = await import('../shared/utils/costModelForm.ts')
  const saved = parseCostFormRow(filled({ outer: { l: '100', w: '60', h: '50', qty: '30' }, fobCurrency: 'CNY', fobPrice: '10' })).input

  // Blank row with just the product no. typed: everything else comes across
  const typed = { ...emptyCostFormRow(4), productNo: 'CL-100' }
  const a = fillEmptyCostFormCells(typed, saved, 'Model A')
  assert.equal(a.row.key, 4)
  assert.equal(a.row.description, 'G-clamp')
  assert.deepEqual(a.row.outer, { l: '100', w: '60', h: '50', qty: '30' })
  assert.equal(a.row.fobCurrency, 'CNY')
  assert.equal(a.row.fobPrice, '10')
  assert.equal(a.row.rrpIncGst, '11')
  assert.equal(a.row.filledFrom, 'Model A')
  assert.equal(a.filled, 14) // description + 4 carton + 4 outer + 5 price fields
  assert.equal(typed.description, '') // original row untouched

  // Already-typed cells are kept; currency follows the typed FOB
  const partly = { ...emptyCostFormRow(5), productNo: 'CL-100', fobPrice: '12', rrpIncGst: '15' }
  const b = fillEmptyCostFormCells(partly, saved, 'Model A')
  assert.equal(b.row.fobPrice, '12')
  assert.equal(b.row.fobCurrency, 'USD')
  assert.equal(b.row.rrpIncGst, '15')
  assert.equal(b.row.buyerBuyPrice, '5')

  // Nothing to fill -> no "filled from" note
  const full = fillEmptyCostFormCells(a.row, saved, 'Model B')
  assert.equal(full.filled, 0)
  assert.equal(full.row.filledFrom, 'Model A')
})

test('filling works on a proxied row (the form\'s rows are Vue reactive proxies)', async () => {
  const { fillEmptyCostFormCells } = await import('../shared/utils/costModelForm.ts')
  const saved = parseCostFormRow(filled()).input
  const raw = { ...emptyCostFormRow(1), productNo: 'CL-100' }
  const proxied = new Proxy({ ...raw, carton: new Proxy(raw.carton, {}) }, {})
  const { row, filled: n } = fillEmptyCostFormCells(proxied, saved, 'Model A')
  assert.equal(row.description, 'G-clamp')
  assert.equal(row.carton.l, '50')
  assert.ok(n > 0)
})
