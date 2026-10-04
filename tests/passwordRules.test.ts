import test from 'node:test'
import assert from 'node:assert/strict'
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from '../shared/utils/passwordRules.ts'

test('a long enough, matching password is accepted', () => {
  assert.equal(newPasswordProblem('abcdefgh', 'abcdefgh'), null)
})

test('a short password is refused', () => {
  assert.match(newPasswordProblem('abc', 'abc') ?? '', new RegExp(String(MIN_PASSWORD_LENGTH)))
})

test('passwords that do not match are refused', () => {
  assert.match(newPasswordProblem('abcdefgh', 'abcdefgi') ?? '', /do not match/)
})
