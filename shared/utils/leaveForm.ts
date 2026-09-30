import { parseDateMY } from './dates.ts'
import { monthName } from './leaveRules.ts'
import type { LeaveDateRestriction, RestrictionInfo } from './leaveRules.ts'

/**
 * Pure helpers behind the leave screens (Step 10.10): turning what a person
 * typed into a request, and wording for balances, restrictions and half days.
 * Kept out of the Vue files so they can be unit tested.
 */

export const DATE_FORMAT_HINT = 'Use dd/mm/yyyy, e.g. 15/03/2026'

export interface LeaveFormInput {
  leaveTypeId: number | null | undefined
  startText: string
  /** Blank means "same as the start date" (a single-day request). */
  endText: string
  startHalfDay: boolean
  endHalfDay: boolean
}

export interface LeaveFormRequest {
  leaveTypeId: number
  startDate: string
  endDate: string
  startHalfDay: boolean
  endHalfDay: boolean
}

export type LeaveFormResult
  = | { status: 'incomplete' }
    | { status: 'invalid', field: 'start' | 'end', message: string }
    | { status: 'ready', request: LeaveFormRequest, isMultiDay: boolean }

/**
 * Reads the form. Date typos are reported as soon as they are made, whatever
 * else is missing; 'incomplete' just means "nothing to check yet". Whether the
 * request is allowed at all (order of dates, weekends, clashes, balance...) is
 * the server's job, via the preview route.
 */
export function buildLeaveRequest(input: LeaveFormInput): LeaveFormResult {
  const startText = input.startText.trim()
  const endText = input.endText.trim()

  if (!startText) {
    // An end date typed with no start: still tell them about a typo in it.
    if (endText && !parseDateMY(endText)) {
      return { status: 'invalid', field: 'end', message: DATE_FORMAT_HINT }
    }
    return { status: 'incomplete' }
  }

  const startDate = parseDateMY(startText)
  if (!startDate) return { status: 'invalid', field: 'start', message: DATE_FORMAT_HINT }

  const endDate = endText ? parseDateMY(endText) : startDate
  if (!endDate) return { status: 'invalid', field: 'end', message: DATE_FORMAT_HINT }

  if (input.leaveTypeId === null || input.leaveTypeId === undefined) return { status: 'incomplete' }

  const isMultiDay = endDate !== startDate
  return {
    status: 'ready',
    isMultiDay,
    request: {
      leaveTypeId: input.leaveTypeId,
      startDate,
      endDate,
      startHalfDay: input.startHalfDay,
      // A single day can only be a half day via the start flag.
      endHalfDay: isMultiDay ? input.endHalfDay : false
    }
  }
}

/** 20 -> '20', 0.5 -> '0.5', 17.5 -> '17.5'. */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** '1 day', '0.5 days', '3 days'. */
export function pluralDays(n: number): string {
  return `${formatDays(n)} ${n === 1 ? 'day' : 'days'}`
}

/**
 * Short note about WHEN a leave type can be taken, for the balance card and the
 * apply form. Null when there is nothing to say.
 */
export function restrictionNote(
  restriction: LeaveDateRestriction,
  info: RestrictionInfo
): { text: string, blocking: boolean } | null {
  if (restriction === 'none' || info.kind === 'any') return null
  if (info.kind === 'missing') {
    const what = info.field === 'date_of_birth' ? 'date of birth' : 'join date'
    return { text: `Not available until the owner sets your ${what}.`, blocking: true }
  }
  const whose = restriction === 'birth_month' ? 'your birth month' : 'your work-anniversary month'
  return { text: `Only in ${monthName(info.month)} (${whose}).`, blocking: false }
}

/** Half-day wording for a list row, or '' when it is all full days. */
export function describeHalfDays(a: {
  startDate: string
  endDate: string
  startHalfDay: boolean
  endHalfDay: boolean
}): string {
  if (a.startDate === a.endDate) return a.startHalfDay ? 'half day' : ''
  const parts: string[] = []
  if (a.startHalfDay) parts.push('starts in the afternoon')
  if (a.endHalfDay) parts.push('ends at lunchtime')
  return parts.join(', ')
}
