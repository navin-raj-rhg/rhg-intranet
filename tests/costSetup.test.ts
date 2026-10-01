import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feeTypeKeyFromName, nextSortOrder, portCodeProblem, tidyPortCode } from '../shared/utils/costSetup.ts'

test('port codes are tidied to upper case letters and numbers', () => {
  assert.equal(tidyPortCode(' hb-a '), 'HBA')
  assert.equal(tidyPortCode('tj1'), 'TJ1')
})

test('port codes must be 2 to 6 characters', () => {
  assert.equal(portCodeProblem('HBA'), '')
  assert.equal(portCodeProblem('A'), 'Port code must be 2 to 6 letters or numbers, e.g. HBA')
  assert.equal(portCodeProblem('ABCDEFG'), 'Port code must be 2 to 6 letters or numbers, e.g. HBA')
  assert.equal(portCodeProblem('--'), 'Port code must be 2 to 6 letters or numbers, e.g. HBA')
})

test('a charge line name becomes a stable key', () => {
  assert.equal(feeTypeKeyFromName('Demurrage Fee'), 'demurrage_fee')
  assert.equal(feeTypeKeyFromName('  CMR / D.O. (extra) '), 'cmr_d_o_extra')
  assert.equal(feeTypeKeyFromName('!!!'), '')
})

test('new sort positions go after the last one', () => {
  assert.equal(nextSortOrder([]), 10)
  assert.equal(nextSortOrder([10, 120, 50]), 130)
})
