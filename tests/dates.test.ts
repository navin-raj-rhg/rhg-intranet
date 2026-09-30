import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDateMY, formatDateRangeMY } from '../shared/utils/dates.ts'

test('dd/mm/yyyy display', () => {
  assert.equal(formatDateMY('2026-09-30'), '30/09/2026')
  assert.equal(formatDateMY('2027-01-05'), '05/01/2027')
  assert.equal(formatDateMY('not a date'), 'not a date') // passed through untouched
  assert.equal(formatDateRangeMY('2026-10-05', '2026-10-09'), '05/10/2026 - 09/10/2026')
  assert.equal(formatDateRangeMY('2026-10-05', '2026-10-05'), '05/10/2026')
})
