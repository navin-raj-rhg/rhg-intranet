import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCostFactorsSnapshot,
  factorsNotReadyReason,
  portLocalCostTotal,
  zeroFreightPorts
} from '../shared/utils/costFactors.ts'
import type { CostFactorsData } from '../shared/utils/costFactors.ts'
import { calculateCostRow } from '../shared/utils/costModel.ts'

const data: CostFactorsData = {
  settings: { usdToAud: 1.5, cnyToAud: 0.21, containerCbm20: 28, containerCbm40hc: 68, updatedAt: '2026-09-30T10:00:00.000Z', updatedByName: null },
  origins: [{ id: 1, code: 'SHA', name: 'Shanghai' }, { id: 2, code: 'NGB', name: 'Ningbo' }],
  destinations: [{ id: 10, code: 'MEL', name: 'Melbourne' }, { id: 11, code: 'SYD', name: 'Sydney' }],
  feeTypes: [{ id: 100, key: 'thc', name: 'THC' }, { id: 101, key: 'doc', name: 'Doc Fee' }],
  freight: [
    { originPortId: 1, destinationPortId: 10, usd20: 1000, usd40hc: 1800 },
    { originPortId: 1, destinationPortId: 11, usd20: 1200, usd40hc: 2000 },
    { originPortId: 2, destinationPortId: 10, usd20: 900, usd40hc: 0 },
    { originPortId: 2, destinationPortId: 11, usd20: 0, usd40hc: 0 }
  ],
  localCosts: [
    { destinationPortId: 10, feeTypeId: 100, aud20: 1200, aud40hc: 1600 },
    { destinationPortId: 10, feeTypeId: 101, aud20: 300, aud40hc: 400 },
    { destinationPortId: 11, feeTypeId: 100, aud20: 1100, aud40hc: 1500 },
    { destinationPortId: 11, feeTypeId: 101, aud20: 300, aud40hc: 400 }
  ]
}

test('local costs add up per port and container size', () => {
  assert.deepEqual(portLocalCostTotal(data, 10), { c20: 1500, c40hc: 2000 })
  assert.deepEqual(portLocalCostTotal(data, 11), { c20: 1400, c40hc: 1900 })
  assert.deepEqual(portLocalCostTotal(data, 999), { c20: 0, c40hc: 0 })
})

test('snapshot for one origin matches the hand-worked 11.2 example', () => {
  const snap = buildCostFactorsSnapshot(data, 1, '2026-09-30T10:00:00.000Z')!
  assert.deepEqual(snap.originPort, { code: 'SHA', name: 'Shanghai' })
  assert.deepEqual(snap.containerCbm, { c20: 28, c40hc: 68 })
  assert.deepEqual(snap.destinations, [
    { port: 'MEL', freightUsd: { c20: 1000, c40hc: 1800 }, localAud: { c20: 1500, c40hc: 2000 } },
    { port: 'SYD', freightUsd: { c20: 1200, c40hc: 2000 }, localAud: { c20: 1400, c40hc: 1900 } }
  ])
  assert.equal(snap.localFees.length, 4)
  assert.deepEqual(snap.localFees[1], { port: 'MEL', fee: 'Doc Fee', aud: { c20: 300, c40hc: 400 } })

  // Feeds straight into the maths: landed cost 3.55 at SYD, as in costModel.test.ts.
  const empty = { lengthCm: null, widthCm: null, heightCm: null, qtyInside: null }
  const r = calculateCostRow({
    carton: { lengthCm: 50, widthCm: 40, heightCm: 35, qtyInside: 20 },
    outer: empty,
    pallet: empty,
    fobCurrency: 'USD',
    fobPrice: 2,
    toolingCost: null,
    dutyPercent: 5,
    buyerBuyPrice: 5,
    rrpIncGst: 11
  }, snap, 'c20')
  assert.ok(Math.abs(r.landedAud! - 3.55) < 1e-9)
  assert.equal(r.landedPort, 'SYD')
})

test('snapshot for an unknown origin is null', () => {
  assert.equal(buildCostFactorsSnapshot(data, 999, 'x'), null)
})

test('a route missing from freight counts as 0', () => {
  const snap = buildCostFactorsSnapshot({ ...data, freight: [] }, 1, 'x')!
  assert.deepEqual(snap.destinations[0]!.freightUsd, { c20: 0, c40hc: 0 })
})

test('ports with a 0 freight rate from an origin are listed', () => {
  assert.deepEqual(zeroFreightPorts(data, 1), [])
  assert.deepEqual(zeroFreightPorts(data, 2), ['MEL', 'SYD'])
})

test('models are blocked until both exchange rates are set', () => {
  assert.equal(factorsNotReadyReason(data), '')
  const noRates = { ...data, settings: { ...data.settings, usdToAud: 0, cnyToAud: 0 } }
  assert.match(factorsNotReadyReason(noRates), /USD to AUD, CNY to AUD/)
  const noCny = { ...data, settings: { ...data.settings, cnyToAud: 0 } }
  assert.match(factorsNotReadyReason(noCny), /CNY to AUD/)
  assert.doesNotMatch(factorsNotReadyReason(noCny), /USD/)
})
