import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTokenCache } from '../shared/utils/tokenCache.ts'

test('a stored login is remembered until the time limit', () => {
  const cache = createTokenCache<string>(60_000)
  cache.set('t1', 'user-a', undefined, 1_000)
  assert.equal(cache.get('t1', 30_000), 'user-a')
  assert.equal(cache.get('t1', 61_001), undefined)
  assert.equal(cache.size(), 0)
})

test('an entry never outlives the token itself', () => {
  const cache = createTokenCache<string>(60_000)
  cache.set('t1', 'user-a', 11_000, 1_000)
  assert.equal(cache.get('t1', 10_000), 'user-a')
  assert.equal(cache.get('t1', 11_000), undefined)
})

test('an already-expired token is not stored', () => {
  const cache = createTokenCache<string>()
  cache.set('t1', 'user-a', 500, 1_000)
  assert.equal(cache.size(), 0)
})

test('the cache stays within its size limit, dropping the oldest', () => {
  const cache = createTokenCache<string>(60_000, 2)
  cache.set('t1', 'a', undefined, 1_000)
  cache.set('t2', 'b', undefined, 1_000)
  cache.set('t3', 'c', undefined, 1_000)
  assert.equal(cache.size(), 2)
  assert.equal(cache.get('t1', 1_000), undefined)
  assert.equal(cache.get('t3', 1_000), 'c')
})
