import test from 'node:test'
import assert from 'node:assert/strict'
import { isPageNavigation, shouldRedirectToLogin } from '../shared/utils/pageGuard.ts'

const HTML = 'text/html,application/xhtml+xml,*/*;q=0.8'

test('a browser asking for a page is a page navigation', () => {
  assert.equal(isPageNavigation('GET', '/', HTML), true)
  assert.equal(isPageNavigation('GET', '/tools/leave-applications?tab=1', HTML), true)
})

test('API calls, assets and non-GET requests are not page navigations', () => {
  assert.equal(isPageNavigation('GET', '/api/auth/me', HTML), false)
  assert.equal(isPageNavigation('GET', '/_nuxt/entry.js', HTML), false)
  assert.equal(isPageNavigation('GET', '/__nuxt_devtools__/client', HTML), false)
  assert.equal(isPageNavigation('GET', '/rhg-logo.png', HTML), false)
  assert.equal(isPageNavigation('POST', '/', HTML), false)
  assert.equal(isPageNavigation('GET', '/', 'application/json'), false)
  assert.equal(isPageNavigation('GET', '/', undefined), false)
})

test('a signed-out visitor is sent to login from any page except login', () => {
  assert.equal(shouldRedirectToLogin('GET', '/', HTML, false), true)
  assert.equal(shouldRedirectToLogin('GET', '/tools/expense-claims', HTML, false), true)
  assert.equal(shouldRedirectToLogin('GET', '/admin/storage', HTML, false), true)
  assert.equal(shouldRedirectToLogin('GET', '/login', HTML, false), false)
  assert.equal(shouldRedirectToLogin('GET', '/login/', HTML, false), false)
  assert.equal(shouldRedirectToLogin('GET', '/login?x=1', HTML, false), false)
})

test('a signed-in visitor is never redirected, and API calls are left alone', () => {
  assert.equal(shouldRedirectToLogin('GET', '/', HTML, true), false)
  assert.equal(shouldRedirectToLogin('GET', '/api/auth/me', HTML, false), false)
})
