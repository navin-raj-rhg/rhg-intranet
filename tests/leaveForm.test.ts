import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLeaveRequest,
  DATE_FORMAT_HINT,
  describeHalfDays,
  formatDays,
  pluralDays,
  restrictionNote
} from '../shared/utils/leaveForm.ts'

const form = (o: Partial<Parameters<typeof buildLeaveRequest>[0]> = {}) =>
  buildLeaveRequest({ leaveTypeId: 1, startText: '', endText: '', startHalfDay: false, endHalfDay: false, ...o })

test('form: nothing to check until there is a start date', () => {
  assert.deepEqual(form(), { status: 'incomplete' })
  assert.deepEqual(form({ startText: '   ' }), { status: 'incomplete' })
})

test('form: a blank end date means a single day', () => {
  const r = form({ startText: '05/10/2026' })
  assert.deepEqual(r, {
    status: 'ready',
    isMultiDay: false,
    request: { leaveTypeId: 1, startDate: '2026-10-05', endDate: '2026-10-05', startHalfDay: false, endHalfDay: false }
  })
})

test('form: a range, read day-first', () => {
  const r = form({ startText: '03/11/2026', endText: '5-11-2026' })
  assert.equal(r.status, 'ready')
  if (r.status === 'ready') {
    assert.equal(r.isMultiDay, true)
    assert.equal(r.request.startDate, '2026-11-03') // 3 November, never 11 March
    assert.equal(r.request.endDate, '2026-11-05')
  }
})

test('form: half days, and the end flag is dropped on a single day', () => {
  const single = form({ startText: '05/10/2026', startHalfDay: true, endHalfDay: true })
  assert.equal(single.status === 'ready' && single.request.startHalfDay, true)
  assert.equal(single.status === 'ready' && single.request.endHalfDay, false)
  const same = form({ startText: '05/10/2026', endText: '05/10/2026', endHalfDay: true }) // typed the same day twice
  assert.equal(same.status === 'ready' && same.request.endHalfDay, false)
  const multi = form({ startText: '05/10/2026', endText: '07/10/2026', startHalfDay: true, endHalfDay: true })
  assert.equal(multi.status === 'ready' && multi.request.startHalfDay && multi.request.endHalfDay, true)
})

test('form: typos are reported at once, on the right field', () => {
  assert.deepEqual(form({ startText: '31/02/2026' }), { status: 'invalid', field: 'start', message: DATE_FORMAT_HINT })
  assert.deepEqual(form({ startText: '05/10/26' }), { status: 'invalid', field: 'start', message: DATE_FORMAT_HINT })
  assert.deepEqual(form({ startText: '05/10/2026', endText: 'tomorrow' }), { status: 'invalid', field: 'end', message: DATE_FORMAT_HINT })
  assert.deepEqual(form({ startText: '', endText: '99/99/2026' }), { status: 'invalid', field: 'end', message: DATE_FORMAT_HINT })
  // a typo shows even before a leave type is chosen
  assert.equal(form({ leaveTypeId: null, startText: 'abc' }).status, 'invalid')
})

test('form: valid dates but no leave type yet is just incomplete', () => {
  assert.deepEqual(form({ leaveTypeId: null, startText: '05/10/2026' }), { status: 'incomplete' })
})

test('day wording', () => {
  assert.equal(formatDays(20), '20')
  assert.equal(formatDays(0.5), '0.5')
  assert.equal(formatDays(17.5), '17.5')
  assert.equal(formatDays(-2), '-2')
  assert.equal(pluralDays(1), '1 day')
  assert.equal(pluralDays(0.5), '0.5 days')
  assert.equal(pluralDays(3), '3 days')
})

test('restriction notes', () => {
  assert.equal(restrictionNote('none', { kind: 'any' }), null)
  assert.deepEqual(restrictionNote('birth_month', { kind: 'month', month: 12 }), { text: 'Only in December (your birth month).', blocking: false })
  assert.deepEqual(restrictionNote('join_month', { kind: 'month', month: 6 }), { text: 'Only in June (your work-anniversary month).', blocking: false })
  assert.deepEqual(restrictionNote('birth_month', { kind: 'missing', field: 'date_of_birth' }), { text: 'Not available until the owner sets your date of birth.', blocking: true })
  assert.deepEqual(restrictionNote('join_month', { kind: 'missing', field: 'join_date' }), { text: 'Not available until the owner sets your join date.', blocking: true })
})

test('half-day wording in the list', () => {
  const a = { startDate: '2026-10-05', endDate: '2026-10-09', startHalfDay: false, endHalfDay: false }
  assert.equal(describeHalfDays(a), '')
  assert.equal(describeHalfDays({ ...a, startHalfDay: true }), 'starts in the afternoon')
  assert.equal(describeHalfDays({ ...a, startHalfDay: true, endHalfDay: true }), 'starts in the afternoon, ends at lunchtime')
  assert.equal(describeHalfDays({ ...a, endDate: '2026-10-05', startHalfDay: true }), 'half day')
  assert.equal(describeHalfDays({ ...a, endDate: '2026-10-05' }), '')
})
