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
  leaveTypeId: number
  leaveTypeName: string
  startDate: string
  endDate: string
  startHalfDay: boolean
  endHalfDay: boolean
  /** Postgres numeric, so a string such as '3.0'. */
  days: string
  reason: string | null
  status: LeaveStatus
  decisionNote: string | null
  canCancel: boolean
  createdAt: string
}

export type LeavePreviewResponse
  = | { ok: true, days: number, balanceChecks: CycleBalanceCheck[] }
    | { ok: false, message: string }
