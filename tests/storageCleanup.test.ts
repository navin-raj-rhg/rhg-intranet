import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findOrphans, formatBytes, isOrphan, isToolStorageKey, storageToolOf } from '../shared/utils/storageCleanup.ts'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 10)
const obj = (key: string, ageDays: number, size = 100) => ({ key, size, lastModified: NOW - ageDays * DAY })

test('a file that something still points to is never an orphan', () => {
  const refs = new Set(['expense-claims/2026/08/a.jpg'])
  assert.equal(isOrphan(obj('expense-claims/2026/08/a.jpg', 30), refs, NOW), false)
  assert.equal(isOrphan(obj('expense-claims/2026/08/b.jpg', 30), refs, NOW), true)
})

test('a recent file is left alone, so an upload in progress is safe', () => {
  assert.equal(isOrphan(obj('leave-applications/2026/10/new.pdf', 0.5), new Set(), NOW), false)
  assert.equal(isOrphan(obj('leave-applications/2026/10/new.pdf', 1), new Set(), NOW), true)
})

test('files outside the tool folders are never touched', () => {
  assert.equal(isToolStorageKey('something-else/file.jpg'), false)
  assert.equal(isOrphan(obj('something-else/file.jpg', 90), new Set(), NOW), false)
  assert.equal(isOrphan(obj('inspection-reporting/2026/09/p.jpg', 90), new Set(), NOW), true)
})

test('orphans come back oldest first', () => {
  const list = [
    obj('expense-claims/a.jpg', 5),
    obj('expense-claims/b.jpg', 50),
    obj('expense-claims/c.jpg', 20)
  ]
  assert.deepEqual(findOrphans(list, new Set(['expense-claims/c.jpg']), NOW).map(o => o.key), ['expense-claims/b.jpg', 'expense-claims/a.jpg'])
})

test('sizes and tool names read plainly', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(3500), '3.4 KB')
  assert.equal(formatBytes(12 * 1024 * 1024), '12.0 MB')
  assert.equal(storageToolOf('expense-claims/2026/09/x.jpg'), 'expense-claims')
})
