import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canCreateInspection,
  canDeleteInspection,
  canEditInspection,
  hasNonConformance,
  inspectionOverall,
  inspectionPhotoProblem,
  inspectionSubmitProblems,
  inspectionTemplateProblems,
  inspectionTransitionProblem,
  tallyInspectionPoints,
  type InspectionPointAnswer
} from '../shared/utils/inspectionRules.ts'

const ok: InspectionPointAnswer = { result: 'compliant', severity: null }
const minor: InspectionPointAnswer = { result: 'non_conformance', severity: 'minor' }
const major: InspectionPointAnswer = { result: 'non_conformance', severity: 'major' }
const na: InspectionPointAnswer = { result: 'na', severity: null }
const blank: InspectionPointAnswer = { result: null, severity: null }

test('tally counts each kind of answer', () => {
  const t = tallyInspectionPoints([ok, ok, na, minor, major, blank, { result: 'non_conformance', severity: null }])
  assert.deepEqual(t, { total: 7, compliant: 2, na: 1, minor: 1, major: 1, unanswered: 2 })
})

test('overall result: all compliant or N/A is a pass', () => {
  assert.equal(inspectionOverall(tallyInspectionPoints([ok, na, ok])), 'pass')
})

test('overall result: 1 or 2 minor is pass with conditions', () => {
  assert.equal(inspectionOverall(tallyInspectionPoints([ok, minor])), 'pass_with_conditions')
  assert.equal(inspectionOverall(tallyInspectionPoints([minor, minor, ok])), 'pass_with_conditions')
})

test('overall result: 3 minor or any major fails', () => {
  assert.equal(inspectionOverall(tallyInspectionPoints([minor, minor, minor])), 'fail')
  assert.equal(inspectionOverall(tallyInspectionPoints([ok, ok, major])), 'fail')
})

test('non-conformance warning', () => {
  assert.ok(hasNonConformance(tallyInspectionPoints([ok, minor])))
  assert.ok(!hasNonConformance(tallyInspectionPoints([ok, na])))
})

test('submit problems: blanks and missing severity are named', () => {
  assert.deepEqual(inspectionSubmitProblems([ok, na, minor]), [])
  assert.deepEqual(inspectionSubmitProblems([ok, blank]), ['1 inspection point has no answer'])
  assert.deepEqual(inspectionSubmitProblems([blank, blank, { result: 'non_conformance', severity: null }]), [
    '2 inspection points have no answer',
    '1 Non-Conformance has no Minor/Major chosen'
  ])
  assert.deepEqual(inspectionSubmitProblems([]), ['This report has no inspection points'])
})

test('who can edit a draft', () => {
  assert.ok(canEditInspection('draft', ['inspector'], true))
  assert.ok(!canEditInspection('draft', ['inspector'], false))
  assert.ok(!canEditInspection('draft', ['reviewer'], true))
  assert.ok(canEditInspection('draft', ['admin'], false))
  assert.ok(canEditInspection('draft', ['owner'], false))
  assert.ok(!canEditInspection('in_review', ['inspector'], true))
  assert.ok(!canEditInspection('closed', ['owner'], true))
})

test('who can create and delete', () => {
  assert.ok(canCreateInspection(['inspector']))
  assert.ok(!canCreateInspection(['reviewer']))
  assert.ok(canDeleteInspection(['admin']))
  assert.ok(canDeleteInspection(['owner']))
  assert.ok(!canDeleteInspection(['inspector', 'reviewer']))
})

test('status changes follow draft -> in review -> closed', () => {
  assert.equal(inspectionTransitionProblem('draft', 'in_review', ['inspector'], true), '')
  assert.match(inspectionTransitionProblem('draft', 'in_review', ['inspector'], false), /inspector who started/)
  assert.equal(inspectionTransitionProblem('in_review', 'closed', ['reviewer'], false), '')
  assert.equal(inspectionTransitionProblem('in_review', 'draft', ['reviewer'], false), '')
  assert.match(inspectionTransitionProblem('in_review', 'closed', ['inspector'], true), /Only a reviewer/)
  assert.match(inspectionTransitionProblem('closed', 'draft', ['owner'], true), /closed report/)
  assert.match(inspectionTransitionProblem('draft', 'closed', ['owner'], true), /can't go from Draft to Closed/)
})

test('template checks', () => {
  assert.deepEqual(inspectionTemplateProblems('Carton QC', [{ name: 'Packaging', points: [{ text: 'Cartons undamaged' }] }]), [])
  assert.deepEqual(inspectionTemplateProblems(' ', []), ['The template needs a name', 'Add at least one section'])
  const problems = inspectionTemplateProblems('T', [
    { name: 'Packaging', points: [] },
    { name: ' packaging ', points: [{ text: ' ' }] },
    { name: '', points: [{ text: 'x' }] }
  ])
  assert.deepEqual(problems, [
    'Section "Packaging" needs at least one inspection point',
    'There are two sections called "packaging"',
    'Section "packaging": point 1 is blank',
    'Section 3 needs a name'
  ])
})

test('photo checks: type and size', () => {
  assert.equal(inspectionPhotoProblem('a.jpg', 'image/jpeg', 3_000_000), '')
  assert.equal(inspectionPhotoProblem('IMG_1.HEIC', '', 4_000_000), '')
  assert.match(inspectionPhotoProblem('a.pdf', 'application/pdf', 1000), /JPEG, PNG or HEIC/)
  assert.match(inspectionPhotoProblem('a.jpg', 'image/jpeg', 11 * 1024 * 1024), /10 MB/)
  assert.equal(inspectionPhotoProblem('a.png', 'image/png', 10 * 1024 * 1024), '')
  assert.match(inspectionPhotoProblem('a.png', 'image/png', 0), /empty/)
})
