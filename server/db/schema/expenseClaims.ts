import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  date,
  integer,
  timestamp
} from 'drizzle-orm/pg-core'
import { profiles } from './core'

/**
 * The fixed set of expense categories. Kept as a Postgres enum (rather than
 * free text) so the dropdown in the UI and the values in the DB can never
 * drift apart.
 */
export const expenseCategory = pgEnum('expense_category', [
  'travel_national',
  'travel_international',
  'parking',
  'staff_wellness_day',
  'office_refreshments_amenities',
  'medical_claim',
  'entertainment'
])

/**
 * submitted -> approved -> paid. There is deliberately no "rejected" status -
 * a manager who has an issue with a claim communicates with the employee
 * directly, and the employee edits or deletes the claim themselves (only
 * possible while it's still 'submitted' - enforced at the API layer, not
 * here).
 */
export const expenseClaimStatus = pgEnum('expense_claim_status', [
  'submitted',
  'approved',
  'paid'
])

/**
 * One row per payroll report a manager runs. Running the report:
 *  1. pulls every currently 'approved' claim,
 *  2. generates the PDF (grouped by employee, per the agreed layout),
 *  3. stores that PDF in R2 (pdfKey) so it can be re-downloaded later,
 *  4. stamps every included claim's `paidBatchId` with this row's id and
 *     flips its status to 'paid'.
 * This table is the audit trail for step 3 above - "what got paid, when,
 * by whom, and what the totals were."
 */
export const expensePayoutBatches = pgTable('expense_payout_batches', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  runBy: uuid('run_by')
    .notNull()
    .references(() => profiles.id),
  runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
  claimCount: integer('claim_count').notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  // The generated PDF, stored under the expense-claims R2 prefix. Nullable
  // only so the row can theoretically exist before the upload finishes;
  // in practice the API route writes both in one request.
  pdfKey: text('pdf_key')
})

export const expenseClaims = pgTable('expense_claims', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => profiles.id),
  category: expenseCategory('category').notNull(),
  // MYR only for now - add a currency column later if multi-currency is
  // ever needed.
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description').notNull(),
  expenseDate: date('expense_date').notNull(),
  // R2 object key for the receipt image/PDF. Every claim requires exactly
  // one receipt (no multi-line-item claims, per the agreed scope).
  receiptKey: text('receipt_key').notNull(),
  status: expenseClaimStatus('status').notNull().default('submitted'),
  approvedBy: uuid('approved_by').references(() => profiles.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  // Set (along with status -> 'paid') when a manager's payroll report run
  // includes this claim. `onDelete: 'set null'` so deleting a batch row
  // (shouldn't normally happen) doesn't cascade-delete the claims - it just
  // orphans the reference.
  paidBatchId: integer('paid_batch_id').references(() => expensePayoutBatches.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
