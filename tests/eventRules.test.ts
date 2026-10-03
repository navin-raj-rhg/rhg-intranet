import test from 'node:test'
import assert from 'node:assert/strict'
import { eventProblem, pickUpcoming, type EventInput, type UpcomingItem } from '../shared/utils/eventRules.ts'

const ok: EventInput = { title: 'Staff lunch', date: '2026-11-05', endDate: null, time: null, place: null, note: null }

test('a plain event is fine', () => {
  assert.equal(eventProblem(ok), '')
  assert.equal(eventProblem({ ...ok, endDate: '2026-11-06', time: '14:30', place: 'HQ', note: 'Bring a plate' }), '')
})

test('bad events are explained', () => {
  assert.ok(eventProblem({ ...ok, title: '  ' }))
  assert.ok(eventProblem({ ...ok, title: 'x'.repeat(121) }))
  assert.ok(eventProblem({ ...ok, date: '2026-02-31' }))
  assert.ok(eventProblem({ ...ok, date: '05/11/2026' }))
  assert.ok(eventProblem({ ...ok, endDate: '2026-11-04' }))
  assert.ok(eventProblem({ ...ok, endDate: 'nope' }))
  assert.ok(eventProblem({ ...ok, time: '25:00' }))
  assert.ok(eventProblem({ ...ok, time: '9:30' }))
})

function item(key: string, date: string, extra: Partial<UpcomingItem> = {}): UpcomingItem {
  return { key, kind: 'event', title: key, date, endDate: null, time: null, place: null, note: null, ...extra }
}

test('upcoming drops finished items, keeps multi-day ones running, sorts soonest first', () => {
  const items = [
    item('late', '2026-12-01'),
    item('past', '2026-10-01'),
    item('today', '2026-10-03'),
    item('running', '2026-10-01', { endDate: '2026-10-04' }),
    item('holiday', '2026-10-20', { kind: 'holiday' })
  ]
  assert.deepEqual(pickUpcoming(items, '2026-10-03').map(i => i.key), ['running', 'today', 'holiday', 'late'])
})

test('same day: no time first, then by time, then title; limit applies', () => {
  const items = [
    item('b', '2026-11-01', { time: '15:00' }),
    item('a', '2026-11-01', { time: '09:00' }),
    item('c', '2026-11-01')
  ]
  assert.deepEqual(pickUpcoming(items, '2026-10-03').map(i => i.key), ['c', 'a', 'b'])
  assert.equal(pickUpcoming(items, '2026-10-03', 2).length, 2)
  const many = Array.from({ length: 8 }, (_, i) => item(`e${i}`, `2026-11-0${i + 1}`))
  assert.equal(pickUpcoming(many, '2026-10-03').length, 5)
})
