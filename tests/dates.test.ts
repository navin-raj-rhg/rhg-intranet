import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDateMY, formatDateRangeMY, parseDateMY } from '../shared/utils/dates.ts'

test('dd/mm/yyyy display', () => {
  assert.equal(formatDateMY('2026-09-30'), '30/09/2026')
  assert.equal(formatDateMY('2027-01-05'), '05/01/2027')
  assert.equal(formatDateMY('not a date'), 'not a date') // passed through untouched
  assert.equal(formatDateRangeMY('2026-10-05', '2026-10-09'), '05/10/2026 - 09/10/2026')
  assert.equal(formatDateRangeMY('2026-10-05', '2026-10-05'), '05/10/2026')
})

test('typed dates are read day-first', () => {
  assert.equal(parseDateMY('30/09/2026'), '2026-09-30')
  assert.equal(parseDateMY('1/9/2026'), '2026-09-01')
  assert.equal(parseDateMY('03/04/2026'), '2026-04-03') // 3 April, never March 4
  assert.equal(parseDateMY(' 30-09-2026 '), '2026-09-30')
  assert.equal(parseDateMY('30.09.2026'), '2026-09-30')
  assert.equal(parseDateMY('29/02/2028'), '2028-02-29') // leap day
  assert.equal(parseDateMY('29/02/2027'), null) // not a leap year
  assert.equal(parseDateMY('31/04/2026'), null)
  assert.equal(parseDateMY('13/13/2026'), null)
  assert.equal(parseDateMY('30/09/26'), null) // two-digit year is ambiguous
  assert.equal(parseDateMY('2026-09-30'), null) // ISO is not what people type here
  assert.equal(parseDateMY(''), null)
  assert.equal(parseDateMY('abc'), null)
  // whatever it accepts, formatting gives the same text back
  assert.equal(formatDateMY(parseDateMY('05/01/2027')!), '05/01/2027')
})
