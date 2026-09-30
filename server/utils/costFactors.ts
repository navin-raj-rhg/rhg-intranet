import { asc, eq } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import {
  costFactorSettings,
  costFreightRates,
  costLocalCosts,
  costLocalFeeTypes,
  costPorts,
  profiles
} from '~~/server/db/schema'
import type { CostFactorsData } from '~~/shared/utils/costFactors'

type Db = ReturnType<typeof useDb>

export const COST_TOOL_ID = 'cost-modelling'
/** Every role on the tool - anyone holding one of these can open it. */
export const COST_ROLES = ['user', 'admin']

/** Admins and the owner can edit Factors and delete models. */
export function isCostAdmin(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('owner')
}

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v))
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

/** The live Factors, as plain numbers. */
export async function loadCostFactors(db: Db): Promise<CostFactorsData> {
  const [settingsRow] = await db
    .select({
      usdToAud: costFactorSettings.usdToAud,
      cnyToAud: costFactorSettings.cnyToAud,
      containerCbm20: costFactorSettings.containerCbm20,
      containerCbm40hc: costFactorSettings.containerCbm40hc,
      updatedAt: costFactorSettings.updatedAt,
      updatedByName: profiles.fullName,
      updatedByEmail: profiles.email
    })
    .from(costFactorSettings)
    .leftJoin(profiles, eq(profiles.id, costFactorSettings.updatedBy))
    .where(eq(costFactorSettings.id, 1))

  if (!settingsRow) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Cost Modelling is not set up yet. Run server/db/manual-sql/006_seed_cost_modelling.sql.'
    })
  }

  const ports = await db
    .select()
    .from(costPorts)
    .where(eq(costPorts.active, true))
    .orderBy(asc(costPorts.sortOrder), asc(costPorts.id))
  const feeTypes = await db
    .select()
    .from(costLocalFeeTypes)
    .where(eq(costLocalFeeTypes.active, true))
    .orderBy(asc(costLocalFeeTypes.sortOrder), asc(costLocalFeeTypes.id))
  const freight = await db.select().from(costFreightRates)
  const localCosts = await db.select().from(costLocalCosts)

  const toPort = (p: typeof ports[number]) => ({ id: p.id, code: p.code, name: p.name })

  return {
    settings: {
      usdToAud: num(settingsRow.usdToAud),
      cnyToAud: num(settingsRow.cnyToAud),
      containerCbm20: num(settingsRow.containerCbm20),
      containerCbm40hc: num(settingsRow.containerCbm40hc),
      updatedAt: settingsRow.updatedAt.toISOString(),
      updatedByName: settingsRow.updatedByName || settingsRow.updatedByEmail || null
    },
    origins: ports.filter(p => p.kind === 'origin').map(toPort),
    destinations: ports.filter(p => p.kind === 'destination').map(toPort),
    feeTypes: feeTypes.map(t => ({ id: t.id, key: t.key, name: t.name })),
    freight: freight.map(r => ({
      originPortId: r.originPortId,
      destinationPortId: r.destinationPortId,
      usd20: num(r.usd20),
      usd40hc: num(r.usd40hc)
    })),
    localCosts: localCosts.map(r => ({
      destinationPortId: r.destinationPortId,
      feeTypeId: r.feeTypeId,
      aud20: num(r.aud20),
      aud40hc: num(r.aud40hc)
    }))
  }
}

export interface CostFactorsUpdate {
  /** settings.updatedAt the editor loaded - guards against two admins overwriting each other. */
  expectedUpdatedAt: string
  usdToAud: number
  cnyToAud: number
  containerCbm20: number
  containerCbm40hc: number
  freight: { originPortId: number, destinationPortId: number, usd20: number, usd40hc: number }[]
  localCosts: { destinationPortId: number, feeTypeId: number, aud20: number, aud40hc: number }[]
}

export class CostFactorsError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * Saves the whole Factors screen in one transaction. Only rows whose values
 * actually changed are written (so each row's updated_at means something).
 * Unknown routes / port-fee pairs are rejected rather than created: new ports
 * and fee lines are added by seed SQL, which also creates their zero rows.
 */
export async function saveCostFactors(db: Db, userId: string, input: CostFactorsUpdate): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ updatedAt: costFactorSettings.updatedAt })
      .from(costFactorSettings)
      .where(eq(costFactorSettings.id, 1))
      .for('update')
    if (!current) throw new CostFactorsError(500, 'Cost Modelling is not set up yet.')

    if (current.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
      throw new CostFactorsError(
        409,
        'Factors were changed by someone else since you opened this page. Reload to see their changes, then make yours again.'
      )
    }

    const now = new Date()

    const freightRows = await tx.select().from(costFreightRates)
    for (const f of input.freight) {
      const row = freightRows.find(r => r.originPortId === f.originPortId && r.destinationPortId === f.destinationPortId)
      if (!row) throw new CostFactorsError(400, 'Unknown freight route.')
      const usd20 = round(f.usd20, 2)
      const usd40hc = round(f.usd40hc, 2)
      if (num(row.usd20) === usd20 && num(row.usd40hc) === usd40hc) continue
      await tx
        .update(costFreightRates)
        .set({ usd20: String(usd20), usd40hc: String(usd40hc), updatedBy: userId, updatedAt: now })
        .where(eq(costFreightRates.id, row.id))
    }

    const localRows = await tx.select().from(costLocalCosts)
    for (const l of input.localCosts) {
      const row = localRows.find(r => r.destinationPortId === l.destinationPortId && r.feeTypeId === l.feeTypeId)
      if (!row) throw new CostFactorsError(400, 'Unknown port local-cost line.')
      const aud20 = round(l.aud20, 2)
      const aud40hc = round(l.aud40hc, 2)
      if (num(row.aud20) === aud20 && num(row.aud40hc) === aud40hc) continue
      await tx
        .update(costLocalCosts)
        .set({ aud20: String(aud20), aud40hc: String(aud40hc), updatedBy: userId, updatedAt: now })
        .where(eq(costLocalCosts.id, row.id))
    }

    // Always touched: settings.updated_at is the "version" of the whole Factors screen.
    await tx
      .update(costFactorSettings)
      .set({
        usdToAud: String(round(input.usdToAud, 6)),
        cnyToAud: String(round(input.cnyToAud, 6)),
        containerCbm20: String(round(input.containerCbm20, 2)),
        containerCbm40hc: String(round(input.containerCbm40hc, 2)),
        updatedBy: userId,
        updatedAt: now
      })
      .where(eq(costFactorSettings.id, 1))
  })
}
