/**
 * Pure Factors helpers (Step 11.4). The Factors API returns a CostFactorsData
 * object; both the Cost Model screen (live figures) and the save route use
 * buildCostFactorsSnapshot() to turn it into the numbers the maths needs for
 * one ship-from port, so the screen and the saved model always agree.
 */

import type { ContainerSize, CostFactorsSnapshot } from './costModel.ts'

export interface CostPort {
  id: number
  code: string
  name: string
}

export interface CostFeeType {
  id: number
  key: string
  name: string
}

export interface CostFactorsData {
  settings: {
    usdToAud: number
    cnyToAud: number
    containerCbm20: number
    containerCbm40hc: number
    updatedAt: string
    updatedByName: string | null
  }
  origins: CostPort[]
  destinations: CostPort[]
  feeTypes: CostFeeType[]
  freight: { originPortId: number, destinationPortId: number, usd20: number, usd40hc: number }[]
  localCosts: { destinationPortId: number, feeTypeId: number, aud20: number, aud40hc: number }[]
}

/** Why models can't be costed yet ('' = ready). */
export function factorsNotReadyReason(data: CostFactorsData): string {
  const missing: string[] = []
  if (!(data.settings.usdToAud > 0)) missing.push('USD to AUD')
  if (!(data.settings.cnyToAud > 0)) missing.push('CNY to AUD')
  if (missing.length) return `Exchange rate not set yet: ${missing.join(', ')}. An admin needs to fill it in on the Factors tab.`
  if (data.destinations.length === 0) return 'No AU ports are set up.'
  return ''
}

/** Freight routes from this origin that are still 0 (worth a warning, not a block). */
export function zeroFreightPorts(data: CostFactorsData, originPortId: number): string[] {
  return data.destinations
    .filter((d) => {
      const f = data.freight.find(r => r.originPortId === originPortId && r.destinationPortId === d.id)
      return !f || f.usd20 === 0 || f.usd40hc === 0
    })
    .map(d => d.code)
}

/** Sum of a port's local costs, per container size. */
export function portLocalCostTotal(data: CostFactorsData, destinationPortId: number): Record<ContainerSize, number> {
  const rows = data.localCosts.filter(r => r.destinationPortId === destinationPortId)
  return {
    c20: rows.reduce((s, r) => s + r.aud20, 0),
    c40hc: rows.reduce((s, r) => s + r.aud40hc, 0)
  }
}

/**
 * The Factors for one ship-from port, in the shape the maths and the saved
 * model use. Returns null if the origin doesn't exist.
 */
export function buildCostFactorsSnapshot(
  data: CostFactorsData,
  originPortId: number,
  capturedAt: string
): CostFactorsSnapshot | null {
  const origin = data.origins.find(o => o.id === originPortId)
  if (!origin) return null

  const destinations = data.destinations.map((d) => {
    const f = data.freight.find(r => r.originPortId === originPortId && r.destinationPortId === d.id)
    return {
      port: d.code,
      freightUsd: { c20: f?.usd20 ?? 0, c40hc: f?.usd40hc ?? 0 },
      localAud: portLocalCostTotal(data, d.id)
    }
  })

  const feeName = new Map(data.feeTypes.map(t => [t.id, t.name]))
  const portCode = new Map(data.destinations.map(d => [d.id, d.code]))
  const localFees = data.localCosts
    .filter(r => portCode.has(r.destinationPortId) && feeName.has(r.feeTypeId))
    .map(r => ({
      port: portCode.get(r.destinationPortId)!,
      fee: feeName.get(r.feeTypeId)!,
      aud: { c20: r.aud20, c40hc: r.aud40hc }
    }))

  return {
    usdToAud: data.settings.usdToAud,
    cnyToAud: data.settings.cnyToAud,
    containerCbm: { c20: data.settings.containerCbm20, c40hc: data.settings.containerCbm40hc },
    destinations,
    originPort: { code: origin.code, name: origin.name },
    localFees,
    capturedAt
  }
}
