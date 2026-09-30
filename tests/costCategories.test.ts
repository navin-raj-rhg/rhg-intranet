import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costNameProblem, sameCostName, sortByCostName, tidyCostName } from '../shared/utils/costCategories.ts'

test('names are trimmed and inner spaces collapsed, case kept', () => {
  assert.equal(tidyCostName('  Hand   Tools '), 'Hand Tools')
  assert.equal(tidyCostName('\tClamps\n'), 'Clamps')
})

test('blank and over-long names are rejected with a plain message', () => {
  assert.equal(costNameProblem('   ', 'Category'), 'Category can\'t be blank')
  assert.match(costNameProblem('x'.repeat(81), 'Sub-category'), /80 characters/)
  assert.equal(costNameProblem('x'.repeat(80)), '')
  assert.equal(costNameProblem(' Clamps '), '')
})

test('same name ignores case and spacing', () => {
  assert.ok(sameCostName('hand  tools', 'Hand Tools'))
  assert.ok(!sameCostName('Hand Tool', 'Hand Tools'))
})

test('sorted A-Z ignoring case', () => {
  const sorted = sortByCostName([{ name: 'furniture' }, { name: 'Clamps' }, { name: 'brackets' }])
  assert.deepEqual(sorted.map(c => c.name), ['brackets', 'Clamps', 'furniture'])
})
