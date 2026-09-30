import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  check,
  unique,
  uniqueIndex,
  index,
  type AnyPgColumn
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { profiles } from './core'
import type { CostFactorsSnapshot, CostRowResult } from '../../../shared/utils/costModel'

/**
 * Cost Modelling (Step 11). Roles: 'user' (view Factors, create/duplicate
 * models) and 'admin' (also edits Factors and deletes models).
 *
 * Factors are the LIVE values admins edit. A saved model never recalculates:
 * it keeps a JSON snapshot of the factors it used, and each product row keeps
 * the figures calculated at save time. Models are never edited - a change is
 * made by duplicating into a new model.
 */

export const costPortKind = pgEnum('cost_port_kind', ['origin', 'destination'])
export const costCurrency = pgEnum('cost_currency', ['USD', 'CNY'])
export const costContainerSize = pgEnum('cost_container_size', ['c20', 'c40hc'])

/** Ship-from (China) and AU destination ports. Data, not code: add a row to add a port. */
export const costPorts = pgTable(
  'cost_ports',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    kind: costPortKind('kind').notNull(),
    code: text('code').notNull().unique(), // short label shown in tables, e.g. 'MEL', 'SHA'
    name: text('name').notNull(), // e.g. 'Melbourne', 'Shanghai'
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true)
  }
)

/** AU port local-cost lines (THC, Doc Fee, ...). Data, not code. */
export const costLocalFeeTypes = pgTable('cost_local_fee_types', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true)
})

/** Exactly one row (id = 1): exchange rates and usable container CBM. */
export const costFactorSettings = pgTable(
  'cost_factor_settings',
  {
    id: integer('id').primaryKey().default(1),
    // AUD per 1 unit of foreign currency. 0 = not set yet (models can't be saved).
    usdToAud: numeric('usd_to_aud', { precision: 12, scale: 6 }).notNull().default('0'),
    cnyToAud: numeric('cny_to_aud', { precision: 12, scale: 6 }).notNull().default('0'),
    containerCbm20: numeric('container_cbm_20', { precision: 6, scale: 2 }).notNull().default('28'),
    containerCbm40hc: numeric('container_cbm_40hc', { precision: 6, scale: 2 }).notNull().default('68'),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    check('cost_factor_settings_single_row', sql`${table.id} = 1`),
    check('cost_factor_settings_rates_nonneg', sql`${table.usdToAud} >= 0 and ${table.cnyToAud} >= 0`),
    check('cost_factor_settings_cbm_positive', sql`${table.containerCbm20} > 0 and ${table.containerCbm40hc} > 0`)
  ]
)

/** Ocean freight in USD per container, origin -> AU port. */
export const costFreightRates = pgTable(
  'cost_freight_rates',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    originPortId: integer('origin_port_id').notNull().references(() => costPorts.id, { onDelete: 'cascade' }),
    destinationPortId: integer('destination_port_id').notNull().references(() => costPorts.id, { onDelete: 'cascade' }),
    usd20: numeric('usd_20', { precision: 12, scale: 2 }).notNull().default('0'),
    usd40hc: numeric('usd_40hc', { precision: 12, scale: 2 }).notNull().default('0'),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    unique('cost_freight_rates_route_unique').on(table.originPortId, table.destinationPortId),
    check('cost_freight_rates_nonneg', sql`${table.usd20} >= 0 and ${table.usd40hc} >= 0`)
  ]
)

/** Local costs in AUD per container, per AU port and fee line. */
export const costLocalCosts = pgTable(
  'cost_local_costs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    destinationPortId: integer('destination_port_id').notNull().references(() => costPorts.id, { onDelete: 'cascade' }),
    feeTypeId: integer('fee_type_id').notNull().references(() => costLocalFeeTypes.id, { onDelete: 'cascade' }),
    aud20: numeric('aud_20', { precision: 12, scale: 2 }).notNull().default('0'),
    aud40hc: numeric('aud_40hc', { precision: 12, scale: 2 }).notNull().default('0'),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    unique('cost_local_costs_port_fee_unique').on(table.destinationPortId, table.feeTypeId),
    check('cost_local_costs_nonneg', sql`${table.aud20} >= 0 and ${table.aud40hc} >= 0`)
  ]
)

/** Shared company list; any user can add. Names are unique ignoring case. */
export const costCategories = pgTable(
  'cost_categories',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    uniqueIndex('cost_categories_name_ci_unique').on(sql`lower(${table.name})`),
    check('cost_categories_name_not_blank', sql`btrim(${table.name}) <> ''`)
  ]
)

export const costSubCategories = pgTable(
  'cost_sub_categories',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer('category_id').notNull().references(() => costCategories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    uniqueIndex('cost_sub_categories_name_ci_unique').on(table.categoryId, sql`lower(${table.name})`),
    check('cost_sub_categories_name_not_blank', sql`btrim(${table.name}) <> ''`)
  ]
)

/** A saved costing. Never updated after insert; only an admin can delete. */
export const costModels = pgTable(
  'cost_models',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // "Category - Sub-category - Supplier - dd/mm/yyyy", built at save time.
    name: text('name').notNull(),
    supplierName: text('supplier_name').notNull(),
    categoryId: integer('category_id').notNull().references(() => costCategories.id, { onDelete: 'restrict' }),
    subCategoryId: integer('sub_category_id').references(() => costSubCategories.id, { onDelete: 'restrict' }),
    originPortId: integer('origin_port_id').notNull().references(() => costPorts.id, { onDelete: 'restrict' }),
    containerBasis: costContainerSize('container_basis').notNull().default('c40hc'),
    // Factors exactly as used for this model (exchange rates, CBM, freight and
    // local costs per AU port for the chosen origin).
    factorsSnapshot: jsonb('factors_snapshot').$type<CostFactorsSnapshot>().notNull(),
    notes: text('notes'),
    duplicatedFromId: integer('duplicated_from_id').references((): AnyPgColumn => costModels.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').notNull().references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    check('cost_models_supplier_not_blank', sql`btrim(${table.supplierName}) <> ''`),
    index('cost_models_created_at_idx').on(table.createdAt)
  ]
)

/** One product per row. Inputs as typed, plus the figures calculated at save. */
export const costModelRows = pgTable(
  'cost_model_rows',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    modelId: integer('model_id').notNull().references(() => costModels.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    productNo: text('product_no'),
    description: text('description'),

    // Packing, cm. qty_inside = what is DIRECTLY inside (see shared/utils/costModel.ts).
    cartonLengthCm: numeric('carton_length_cm', { precision: 8, scale: 2 }),
    cartonWidthCm: numeric('carton_width_cm', { precision: 8, scale: 2 }),
    cartonHeightCm: numeric('carton_height_cm', { precision: 8, scale: 2 }),
    cartonQty: integer('carton_qty'),
    outerLengthCm: numeric('outer_length_cm', { precision: 8, scale: 2 }),
    outerWidthCm: numeric('outer_width_cm', { precision: 8, scale: 2 }),
    outerHeightCm: numeric('outer_height_cm', { precision: 8, scale: 2 }),
    outerQty: integer('outer_qty'),
    palletLengthCm: numeric('pallet_length_cm', { precision: 8, scale: 2 }),
    palletWidthCm: numeric('pallet_width_cm', { precision: 8, scale: 2 }),
    palletHeightCm: numeric('pallet_height_cm', { precision: 8, scale: 2 }),
    palletQty: integer('pallet_qty'),

    fobCurrency: costCurrency('fob_currency').notNull().default('USD'),
    fobPrice: numeric('fob_price', { precision: 14, scale: 4 }),
    toolingCost: numeric('tooling_cost', { precision: 14, scale: 2 }),
    dutyPercent: numeric('duty_percent', { precision: 6, scale: 3 }),
    buyerBuyPrice: numeric('buyer_buy_price', { precision: 14, scale: 4 }),
    rrpIncGst: numeric('rrp_inc_gst', { precision: 14, scale: 4 }),

    // Every calculated figure at save time, so history never shifts.
    results: jsonb('results').$type<CostRowResult>().notNull()
  },
  table => [
    index('cost_model_rows_model_idx').on(table.modelId),
    // Product look-up by product no. (Step 11.8d), case-insensitive.
    index('cost_model_rows_product_no_idx').on(sql`lower(${table.productNo})`),
    check('cost_model_rows_duty_range', sql`${table.dutyPercent} is null or (${table.dutyPercent} >= 0 and ${table.dutyPercent} <= 100)`)
  ]
)
