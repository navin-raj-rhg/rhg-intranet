/**
 * Pure rules for Inspection Reporting (Step 12.2): the overall result, what must
 * be filled in before a report goes to review, who may move a report between
 * statuses, template checks and the photo size/type limit. The server and the
 * forms use the same code.
 */

export type InspectionPointResult = 'compliant' | 'non_conformance' | 'na'
export type InspectionSeverity = 'minor' | 'major'
export type InspectionStatus = 'draft' | 'in_review' | 'closed'
export type InspectionOverall = 'pass' | 'pass_with_conditions' | 'fail'
export type InspectionLocationType = 'supplier' | 'dc'

/** Fail at 3 or more Minor non-conformances, or any Major. */
export const INSPECTION_FAIL_MINOR_COUNT = 3
export const INSPECTION_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const INSPECTION_NAME_MAX = 120

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  closed: 'Closed'
}

export const INSPECTION_OVERALL_LABELS: Record<InspectionOverall, string> = {
  pass: 'Pass',
  pass_with_conditions: 'Pass with conditions',
  fail: 'Fail'
}

/** What the inspector has entered for one inspection point. */
export interface InspectionPointAnswer {
  result: InspectionPointResult | null
  severity: InspectionSeverity | null
}

export interface InspectionTally {
  total: number
  compliant: number
  na: number
  minor: number
  major: number
  /** No answer yet, or a Non-Conformance with no Minor/Major chosen. */
  unanswered: number
}

export function tallyInspectionPoints(points: InspectionPointAnswer[]): InspectionTally {
  const tally: InspectionTally = { total: points.length, compliant: 0, na: 0, minor: 0, major: 0, unanswered: 0 }
  for (const p of points) {
    if (p.result === 'compliant') tally.compliant++
    else if (p.result === 'na') tally.na++
    else if (p.result === 'non_conformance') {
      if (p.severity === 'minor') tally.minor++
      else if (p.severity === 'major') tally.major++
      else tally.unanswered++
    } else tally.unanswered++
  }
  return tally
}

/** Result so far; unanswered points are ignored (check `inspectionSubmitProblems` for completeness). */
export function inspectionOverall(tally: InspectionTally): InspectionOverall {
  if (tally.major > 0 || tally.minor >= INSPECTION_FAIL_MINOR_COUNT) return 'fail'
  if (tally.minor > 0) return 'pass_with_conditions'
  return 'pass'
}

export function hasNonConformance(tally: InspectionTally): boolean {
  return tally.minor + tally.major > 0
}

/** Plain-English reasons a draft can't go to review yet (empty = fine). */
export function inspectionSubmitProblems(points: InspectionPointAnswer[]): string[] {
  const problems: string[] = []
  if (points.length === 0) return ['This report has no inspection points']
  const noAnswer = points.filter(p => p.result === null).length
  const noSeverity = points.filter(p => p.result === 'non_conformance' && p.severity === null).length
  if (noAnswer > 0) problems.push(`${noAnswer} inspection point${noAnswer === 1 ? ' has' : 's have'} no answer`)
  if (noSeverity > 0) problems.push(`${noSeverity} Non-Conformance${noSeverity === 1 ? ' has' : 's have'} no Minor/Major chosen`)
  return problems
}

// ---- Status changes and permissions --------------------------------------

export function isInspectionAdmin(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('owner')
}

function isInspectionReviewer(roles: string[]): boolean {
  return roles.includes('reviewer') || roles.includes('owner')
}

function isInspectionInspector(roles: string[]): boolean {
  return roles.includes('inspector') || roles.includes('owner')
}

/** Only the person who started it (or an admin) edits a draft. */
export function canEditInspection(status: InspectionStatus, roles: string[], isAuthor: boolean): boolean {
  if (status !== 'draft') return false
  return (isAuthor && isInspectionInspector(roles)) || isInspectionAdmin(roles)
}

export function canCreateInspection(roles: string[]): boolean {
  return isInspectionInspector(roles) || isInspectionAdmin(roles)
}

export function canDeleteInspection(roles: string[]): boolean {
  return isInspectionAdmin(roles)
}

/** Plain-English problem with moving a report to another status, or '' if allowed. */
export function inspectionTransitionProblem(
  from: InspectionStatus,
  to: InspectionStatus,
  roles: string[],
  isAuthor: boolean
): string {
  if (from === 'draft' && to === 'in_review') {
    return canEditInspection('draft', roles, isAuthor) ? '' : 'Only the inspector who started this report can submit it for review'
  }
  if (from === 'in_review' && (to === 'closed' || to === 'draft')) {
    return isInspectionReviewer(roles) ? '' : 'Only a reviewer can close a report or send it back'
  }
  if (from === 'closed') return 'A closed report can\'t be changed'
  return `A report can't go from ${INSPECTION_STATUS_LABELS[from]} to ${INSPECTION_STATUS_LABELS[to]}`
}

// ---- Templates -----------------------------------------------------------

export interface InspectionTemplatePoint {
  text: string
}

export interface InspectionTemplateSection {
  name: string
  points: InspectionTemplatePoint[]
}

function tidyInspectionName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Plain-English problems with a template being saved (empty = fine). */
export function inspectionTemplateProblems(name: string, sections: InspectionTemplateSection[]): string[] {
  const problems: string[] = []
  const title = tidyInspectionName(name)
  if (!title) problems.push('The template needs a name')
  else if (title.length > INSPECTION_NAME_MAX) problems.push(`The template name must be ${INSPECTION_NAME_MAX} characters or fewer`)
  if (sections.length === 0) problems.push('Add at least one section')
  const seen = new Set<string>()
  sections.forEach((s, i) => {
    const sectionName = tidyInspectionName(s.name)
    const label = sectionName ? `Section "${sectionName}"` : `Section ${i + 1}`
    if (!sectionName) problems.push(`Section ${i + 1} needs a name`)
    else if (seen.has(sectionName.toLowerCase())) problems.push(`There are two sections called "${sectionName}"`)
    else seen.add(sectionName.toLowerCase())
    if (s.points.length === 0) problems.push(`${label} needs at least one inspection point`)
    s.points.forEach((p, j) => {
      if (!tidyInspectionName(p.text)) problems.push(`${label}: point ${j + 1} is blank`)
    })
  })
  return problems
}

// ---- Photos --------------------------------------------------------------

const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif']
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif']

/** Plain-English problem with a photo, or '' if fine. Phones often send HEIC with no type, so the extension counts too. */
export function inspectionPhotoProblem(fileName: string, contentType: string, sizeBytes: number): string {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
  const typeOk = PHOTO_TYPES.includes(contentType.toLowerCase()) || (contentType === '' && PHOTO_EXTENSIONS.includes(ext))
  if (!typeOk) return 'Photos must be JPEG, PNG or HEIC images'
  if (sizeBytes <= 0) return 'That photo is empty'
  if (sizeBytes > INSPECTION_PHOTO_MAX_BYTES) return `Photos must be ${INSPECTION_PHOTO_MAX_BYTES / 1024 / 1024} MB or smaller`
  return ''
}
