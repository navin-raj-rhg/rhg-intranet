import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  check,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { profiles } from './core'
import type { InspectionTemplateSection } from '../../../shared/utils/inspectionRules'

/**
 * Inspection Reporting (Step 12). Roles: 'inspector' (creates reports and edits
 * their own drafts), 'reviewer' (closes reports or sends them back) and 'admin'
 * (builds templates, manages suppliers/DCs, deletes reports).
 *
 * A report keeps its own frozen copy of the template it was started from (one
 * `inspection_report_points` row per inspection point, carrying the section
 * name and point text), and of the supplier/DC name, so later edits to a
 * template or to the supplier/DC list never change an old report.
 */

export const inspectionLocationType = pgEnum('inspection_location_type', ['supplier', 'dc'])
export const inspectionStatus = pgEnum('inspection_status', ['draft', 'in_review', 'closed'])
export const inspectionPointResult = pgEnum('inspection_point_result', ['compliant', 'non_conformance', 'na'])
export const inspectionSeverity = pgEnum('inspection_severity', ['minor', 'major'])
export const inspectionOverallResult = pgEnum('inspection_overall', ['pass', 'pass_with_conditions', 'fail'])
export const inspectionEventAction = pgEnum('inspection_event_action', ['created', 'submitted', 'returned', 'closed'])

/** The supplier / DC list an inspector picks from. Admin-managed. */
export const inspectionLocations = pgTable(
  'inspection_locations',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    type: inspectionLocationType('type').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('inspection_locations_type_name_ci_unique').on(table.type, sql`lower(${table.name})`)]
)

/**
 * Report templates built by admins. `sections` is the whole form as JSON:
 * [{ name, points: [{ text }] }] (shape: InspectionTemplateSection). Saved in
 * one go from the form builder. `active = false` hides it from new reports.
 */
export const inspectionTemplates = pgTable(
  'inspection_templates',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    sections: jsonb('sections').$type<InspectionTemplateSection[]>().notNull(),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('inspection_templates_name_ci_unique').on(sql`lower(${table.name})`)]
)

export const inspectionReports = pgTable(
  'inspection_reports',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    status: inspectionStatus('status').notNull().default('draft'),
    // Source records may later be renamed or removed; the name/type are frozen copies.
    locationId: integer('location_id').references(() => inspectionLocations.id, { onDelete: 'set null' }),
    locationType: inspectionLocationType('location_type').notNull(),
    locationName: text('location_name').notNull(),
    templateId: integer('template_id').references(() => inspectionTemplates.id, { onDelete: 'set null' }),
    templateName: text('template_name').notNull(),
    reference: text('reference'), // PO / reference, free text
    inspectionDate: date('inspection_date').notNull(),
    notes: text('notes'),
    // Calculated from the points while open; frozen here when the report is closed.
    overall: inspectionOverallResult('overall'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    index('inspection_reports_created_at_idx').on(table.createdAt),
    index('inspection_reports_status_idx').on(table.status),
    check('inspection_reports_closed_has_overall', sql`${table.status} <> 'closed' or ${table.overall} is not null`)
  ]
)

/** One inspection point in one report, with the section/point text copied from the template. */
export const inspectionReportPoints = pgTable(
  'inspection_report_points',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    reportId: integer('report_id')
      .notNull()
      .references(() => inspectionReports.id, { onDelete: 'cascade' }),
    sectionName: text('section_name').notNull(),
    sectionOrder: integer('section_order').notNull(),
    pointText: text('point_text').notNull(),
    pointOrder: integer('point_order').notNull(),
    result: inspectionPointResult('result'), // null = not answered yet
    severity: inspectionSeverity('severity'), // only with non_conformance
    comment: text('comment')
  },
  table => [
    index('inspection_report_points_report_idx').on(table.reportId),
    check(
      'inspection_report_points_severity_only_nc',
      sql`${table.severity} is null or ${table.result} = 'non_conformance'`
    )
  ]
)

/** Photos attached to a point. Files live in R2 under inspection-reporting/<yyyy>/<mm>/. */
export const inspectionPhotos = pgTable(
  'inspection_photos',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    reportPointId: integer('report_point_id')
      .notNull()
      .references(() => inspectionReportPoints.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('inspection_photos_point_idx').on(table.reportPointId)]
)

/** Status history and reviewer comments (a comment goes with "returned" or "closed"). */
export const inspectionEvents = pgTable(
  'inspection_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    reportId: integer('report_id')
      .notNull()
      .references(() => inspectionReports.id, { onDelete: 'cascade' }),
    action: inspectionEventAction('action').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => profiles.id),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('inspection_events_report_idx').on(table.reportId)]
)

/**
 * Products RHG has inspected, so typing a product number recalls its
 * description next time. Updated whenever a report is saved with a description
 * (the latest one wins); old reports keep the description they were written with.
 */
export const inspectionProducts = pgTable(
  'inspection_products',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productNo: text('product_no').notNull(),
    description: text('description'),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('inspection_products_no_ci_unique').on(sql`lower(${table.productNo})`)]
)

/** The products one report covers: frozen copies of the number and description, in the order entered. */
export const inspectionReportProducts = pgTable(
  'inspection_report_products',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    reportId: integer('report_id')
      .notNull()
      .references(() => inspectionReports.id, { onDelete: 'cascade' }),
    productNo: text('product_no').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull()
  },
  table => [index('inspection_report_products_report_idx').on(table.reportId)]
)
