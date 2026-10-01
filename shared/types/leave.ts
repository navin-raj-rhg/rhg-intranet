import type {
  CycleBalanceCheck,
  LeaveBalance,
  LeaveDateRestriction,
  LeaveStatus,
  RestrictionInfo
} from '../utils/leaveRules'

/** Response shapes of the leave API, shared by the leave screens. */

export interface LeaveTypeBalanceItem {
  leaveTypeId: number
  key: string
  name: string
  cycleStartMonth: number
  hasBalance: boolean
  dateRestriction: LeaveDateRestriction
  restriction: RestrictionInfo
  /** null for types without a balance (Unpaid). */
  balance: LeaveBalance | null
}

export interface LeaveBalancesResponse {
  asOf: string
  joinDateMissing: boolean
  dateOfBirthMissing: boolean
  types: LeaveTypeBalanceItem[]
}

export interface MyLeaveApplication {
  id: number
  employeeId: string
  leaveTypeId: number
  leaveTypeName: string
  startDate: string
  endDate: string
  startHalfDay: boolean
  endHalfDay: boolean
  /** Postgres numeric, so a string such as '3.0'. */
  days: string
  reason: string | null
  /** R2 key of an optional attachment; the file itself is fetched via the detail route. */
  attachmentKey: string | null
  status: LeaveStatus
  decisionNote: string | null
  canCancel: boolean
  createdAt: string
}

export type LeavePreviewResponse
  = | { ok: true, days: number, balanceChecks: CycleBalanceCheck[], holidaysSkipped: { date: string, name: string }[] }
    | { ok: false, message: string }

/** A row of the team list (scope=team): the same as one's own, plus who it belongs to. */
export interface TeamLeaveApplication extends MyLeaveApplication {
  employeeName: string | null
  employeeEmail: string | null
  decidedAt: string | null
}

/** GET applications/:id - what the review dialog shows. */
export interface LeaveApplicationDetail extends TeamLeaveApplication {
  attachmentUrl: string | null
  deciderName: string | null
  /** For a pending application: what approving it does to the balance. Null once decided. */
  balanceImpact: CycleBalanceCheck[] | null
}
