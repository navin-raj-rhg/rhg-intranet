import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoHolidaysForYear } from '../shared/utils/autoHolidays.ts'

const byDate = (year: number) => new Map(autoHolidaysForYear(year).map(h => [h.date, h.name]))

test('shared dates merge both countries into one entry', () => {
  const h = byDate(2027)
  assert.equal(h.get('2027-01-01'), 'New Year\'s Day (MY, AU)')
  assert.equal(h.get('2027-12-25'), 'Christmas Day (MY, AU)')
})

test('Malaysian days are in English and tagged MY', () => {
  const h = byDate(2027)
  assert.equal(h.get('2027-08-31'), 'Merdeka Day (MY)')
  assert.equal(h.get('2027-09-16'), 'Malaysia Day (MY)')
  assert.match(h.get('2027-02-08')!, /Chinese New Year \(replacement day\) \(MY\)/)
})

test('Australian national days are tagged AU, with no state days or observances', () => {
  const h = byDate(2027)
  assert.equal(h.get('2027-01-26'), 'Australia Day (AU)')
  assert.equal(h.get('2027-04-25'), 'Anzac Day (AU)')
  assert.equal(h.get('2027-05-09'), undefined) // Mother's Day is not a public holiday
})

test('one entry per date, in date order, names within the 80 character limit', () => {
  const list = autoHolidaysForYear(2026)
  const dates = list.map(h => h.date)
  assert.deepEqual(dates, [...new Set(dates)].sort())
  assert.ok(list.every(h => h.name.length > 0 && h.name.length <= 80))
  assert.ok(list.every(h => h.date.startsWith('2026-')))
})
