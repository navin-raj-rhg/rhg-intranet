import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
  check,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { profiles } from './core'

/**
 * Product Information Management (Step 17). Roles: 'viewer' (read and download),
 * 'editor' (create and edit products, upload files, import) and 'admin'
 * (categories, attributes, deleting). Owner bypasses all three. Everyone with
 * any role sees every product.
 *
 * Rules and checks live in shared/utils/pimRules.ts.
 */

export const pimProductStatus = pgEnum('pim_product_status', ['draft', 'active', 'discontinued'])
export const pimFileKind = pgEnum('pim_file_kind', ['image', 'document'])
export const pimAttributeType = pgEnum('pim_attribute_type', ['text', 'number', 'yesno', 'list'])
export const pimPackagingLevel = pgEnum('pim_packaging_level', ['carton', 'outer', 'pallet'])

/**
 * Categories, with one level of sub-category (`parent_id` set). Admin-managed,
 * switched off rather than deleted once used. `required_fields` (top-level
 * only) lists the built-in fields that count towards a product's completeness.
 */
export const pimCategories = pgTable(
  'pim_categories',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    parentId: integer('parent_id').references((): AnyPgColumn => pimCategories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    requiredFields: jsonb('required_fields').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    // Unique among siblings, ignoring case (0 stands in for "top level").
    uniqueIndex('pim_categories_name_ci_unique').on(sql`coalesce(${table.parentId}, 0)`, sql`lower(${table.name})`)
  ]
)

/** Admin-defined extra fields for the products of one top-level category. */
export const pimAttributes = pgTable(
  'pim_attributes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => pimCategories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: pimAttributeType('type').notNull(),
    // Choices for 'list' attributes.
    options: jsonb('options').$type<string[]>(),
    required: boolean('required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('pim_attributes_name_ci_unique').on(table.categoryId, sql`lower(${table.name})`)]
)

export const pimProducts = pgTable(
  'pim_products',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productNo: text('product_no').notNull(),
    name: text('name').notNull(),
    status: pimProductStatus('status').notNull().default('draft'),
    brand: text('brand'),
    categoryId: integer('category_id').references(() => pimCategories.id, { onDelete: 'set null' }),
    subCategoryId: integer('sub_category_id').references(() => pimCategories.id, { onDelete: 'set null' }),
    shortDescription: text('short_description'),
    longDescription: text('long_description'),
    barcode: text('barcode'),
    rrp: numeric('rrp', { precision: 12, scale: 2 }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    // Product numbers are unique across RHG, ignoring case.
    uniqueIndex('pim_products_product_no_ci_unique').on(sql`lower(${table.productNo})`),
    index('pim_products_category_idx').on(table.categoryId),
    index('pim_products_status_idx').on(table.status)
  ]
)

/** A product can have several suppliers; exactly one is primary. */
export const pimProductSuppliers = pgTable(
  'pim_product_suppliers',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => pimProducts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    supplierCode: text('supplier_code'),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  table => [
    uniqueIndex('pim_product_suppliers_name_ci_unique').on(table.productId, sql`lower(${table.name})`),
    uniqueIndex('pim_product_suppliers_one_primary')
      .on(table.productId)
      .where(sql`${table.isPrimary}`)
  ]
)

/** Carton / outer / pallet details; one row per level a product has. */
export const pimPackaging = pgTable(
  'pim_packaging',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => pimProducts.id, { onDelete: 'cascade' }),
    level: pimPackagingLevel('level').notNull(),
    lengthCm: numeric('length_cm', { precision: 10, scale: 2 }),
    widthCm: numeric('width_cm', { precision: 10, scale: 2 }),
    heightCm: numeric('height_cm', { precision: 10, scale: 2 }),
    weightKg: numeric('weight_kg', { precision: 10, scale: 3 }),
    // What is DIRECTLY inside (same meaning as in Cost Modelling).
    qtyInside: integer('qty_inside')
  },
  table => [
    primaryKey({ columns: [table.productId, table.level] }),
    check(
      'pim_packaging_positive',
      sql`coalesce(${table.lengthCm}, 1) > 0 and coalesce(${table.widthCm}, 1) > 0 and coalesce(${table.heightCm}, 1) > 0 and coalesce(${table.weightKg}, 1) > 0 and coalesce(${table.qtyInside}, 1) >= 1`
    )
  ]
)

/** A product's value for one attribute, always stored as text (see checkPimAttributeValue). */
export const pimAttributeValues = pgTable(
  'pim_attribute_values',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => pimProducts.id, { onDelete: 'cascade' }),
    attributeId: integer('attribute_id')
      .notNull()
      .references(() => pimAttributes.id, { onDelete: 'cascade' }),
    value: text('value').notNull()
  },
  table => [primaryKey({ columns: [table.productId, table.attributeId] })]
)

/** Images and documents, stored in R2 under `pim/`. At most one image per product is the main one. */
export const pimFiles = pgTable(
  'pim_files',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => pimProducts.id, { onDelete: 'cascade' }),
    kind: pimFileKind('kind').notNull(),
    r2Key: text('r2_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    isMain: boolean('is_main').notNull().default(false),
    uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    index('pim_files_product_idx').on(table.productId),
    uniqueIndex('pim_files_one_main')
      .on(table.productId)
      .where(sql`${table.isMain}`),
    check('pim_files_main_is_image', sql`not ${table.isMain} or ${table.kind} = 'image'`)
  ]
)

/** Change history: one row per save, with the list of what changed. */
export const pimHistory = pgTable(
  'pim_history',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => pimProducts.id, { onDelete: 'cascade' }),
    changedBy: uuid('changed_by').references(() => profiles.id, { onDelete: 'set null' }),
    summary: text('summary').notNull(),
    // [{ field, from, to }]
    changes: jsonb('changes').$type<{ field: string, from: string, to: string }[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('pim_history_product_idx').on(table.productId, table.createdAt)]
)
