import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deactivationProblem } from '../shared/utils/deactivation.ts'

const base = { name: 'Dee', isOwner: false, isSelf: false, teams: [] }

test('an ordinary person with no team can be deactivated', () => {
  assert.equal(deactivationProblem(base), '')
})

test('owners can never be deactivated, nor can you deactivate yourself', () => {
  assert.match(deactivationProblem({ ...base, isOwner: true }), /owners can't be deactivated/)
  assert.match(deactivationProblem({ ...base, isSelf: true }), /deactivate your own account/)
})

test('a manager with active employees is refused, naming them and the tool', () => {
  const msg = deactivationProblem({
    ...base,
    teams: [
      { toolName: 'Leave Applications', employeeNames: ['Ann', 'Bob'] },
      { toolName: 'Expense Claims', employeeNames: ['Ann'] }
    ]
  })
  assert.match(msg, /Ann, Bob in Leave Applications; Ann in Expense Claims/)
  assert.match(msg, /another manager first/)
})

test('a manager whose employees are all deactivated can be deactivated', () => {
  assert.equal(deactivationProblem({ ...base, teams: [{ toolName: 'Leave Applications', employeeNames: [] }] }), '')
})
