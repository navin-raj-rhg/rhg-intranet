import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPANY_EMAIL_DOMAINS, isSignupEmailAllowed, signupNotAllowedMessage } from '../shared/utils/signupRules.ts'

const ALLOWED = ['rapidhardwaregroup.com.au', 'ttfs.com.au', 'contractor@other.com']

test('company domain addresses are allowed, ignoring case and spaces', () => {
  assert.equal(isSignupEmailAllowed('jane@rapidhardwaregroup.com.au', ALLOWED), true)
  assert.equal(isSignupEmailAllowed('  Jane.Tan@TTFS.com.au ', ALLOWED), true)
})

test('other domains are refused', () => {
  assert.equal(isSignupEmailAllowed('someone@gmail.com', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('someone@other.com', ALLOWED), false)
})

test('look-alike and sub-domains are refused', () => {
  assert.equal(isSignupEmailAllowed('a@ttfs.com.au.evil.com', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('a@mail.ttfs.com.au', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('a@notttfs.com.au', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('ttfs.com.au@gmail.com', ALLOWED), false)
})

test('a single allowed address works without allowing its whole domain', () => {
  assert.equal(isSignupEmailAllowed('Contractor@Other.com', ALLOWED), true)
  assert.equal(isSignupEmailAllowed('someone@other.com', ALLOWED), false)
})

test('malformed addresses and empty lists are refused', () => {
  assert.equal(isSignupEmailAllowed('', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('no-at-sign', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('@ttfs.com.au', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('jane@', ALLOWED), false)
  assert.equal(isSignupEmailAllowed('jane@ttfs.com.au', []), false)
  assert.equal(isSignupEmailAllowed('jane@ttfs.com.au', ['  ', '']), false)
})

test('the message names the company domains', () => {
  const msg = signupNotAllowedMessage()
  for (const d of COMPANY_EMAIL_DOMAINS) assert.ok(msg.includes(`@${d}`))
})
