import type { H3Event } from 'h3'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import {
  inspectionEvents,
  inspectionLocations,
  inspectionPhotos,
  inspectionReportPoints,
  inspectionReports,
  inspectionTemplates,
  profiles
} from '~~/server/db/schema'
import { buildObjectKey, deleteObject, getDownloadUrl, getUploadUrl, headObjectSize } from '~~/server/utils/r2'
import {
  canCreateInspection,
  canDeleteInspection,
  canEditInspection,
  hasNonConformance,
  inspectionOverall,
  inspectionPhotoContentType,
  inspectionPhotoProblem,
  inspectionSubmitProblems,
  inspectionTransitionProblem,
  tallyInspectionPoints,
  type InspectionPointResult,
  type InspectionSeverity,
  type InspectionStatus
} from '~~/shared/utils/inspectionRules'

import type {
  InspectionListItem,
  InspectionListResponse,
  InspectionLocationItem,
  InspectionReportView
} from '~~/shared/types/inspection'

type Db = ReturnType<typeof useDb>

export const INSPECTION_TOOL_ID = 'inspection-reporting'
/** Every role on the tool - anyone holding one can open it and see every report. */
export const INSPECTION_ROLES = ['inspector', 'reviewer', 'admin']
export const INSPECTION_PAGE_SIZE = 25

export class InspectionError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const personName = (fullName: string | null, email: string | null) => fullName || email || 'Unknown'
const text = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/** Turn an InspectionError into an HTTP error; anything else is rethrown. */
export function inspectionHttpError(err: unknown): never {
  if (err instanceof InspectionError) throw createError({ statusCode: err.status, statusMessage: err.message })
  throw err
}

export function parseInspectionId(event: H3Event, what = 'inspection report', param = 'id'): number {
  const id = Number(getRouterParam(event, param))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: `Invalid ${what}.` })
  return id
}

/* ------------------------------------------------------------------ */
/* Suppliers and DCs                                                   */
/* ------------------------------------------------------------------ */

export async function listInspectionLocations(db: Db, includeInactive: boolean): Promise<InspectionLocationItem[]> {
  const rows = await db
    .select({
      id: inspectionLocations.id,
      type: inspectionLocations.type,
      name: inspectionLocations.name,
      active: inspectionLocations.active
    })
    .from(inspectionLocations)
    .where(includeInactive ? undefined : eq(inspectionLocations.active, true))
  return rows.sort((a, b) =>
    a.type === b.type
      ? a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
      : a.type.localeCompare(b.type))
}

/* ------------------------------------------------------------------ */
/* Reports: list                                                       */
/* ------------------------------------------------------------------ */

export async function listInspectionReports(db: Db, q: string, status: string, page: number): Promise<InspectionListResponse> {
  const term = q.trim()
  const pattern = `%${term.replace(/[\\%_]/g, m => `\\${m}`)}%`
  const filters = [
    term
      ? or(
          ilike(inspectionReports.locationName, pattern),
          ilike(inspectionReports.templateName, pattern),
          ilike(inspectionReports.productNo, pattern),
          ilike(inspectionReports.reference, pattern),
          sql`${inspectionReports.id}::text = ${term.replace(/^#/, '')}`
        )
      : undefined,
    status === 'draft' || status === 'in_review' || status === 'closed'
      ? eq(inspectionReports.status, status)
      : undefined
  ]
  const where = and(...filters)

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(inspectionReports).where(where)
  const safePage = Math.max(1, Math.floor(page) || 1)

  const rows = await db
    .select({
      id: inspectionReports.id,
      status: inspectionReports.status,
      locationType: inspectionReports.locationType,
      locationName: inspectionReports.locationName,
      templateName: inspectionReports.templateName,
      productNo: inspectionReports.productNo,
      reference: inspectionReports.reference,
      inspectionDate: inspectionReports.inspectionDate,
      overall: inspectionReports.overall,
      createdByName: profiles.fullName,
      createdByEmail: profiles.email
    })
    .from(inspectionReports)
    .leftJoin(profiles, eq(profiles.id, inspectionReports.createdBy))
    .where(where)
    .orderBy(desc(inspectionReports.createdAt), desc(inspectionReports.id))
    .limit(INSPECTION_PAGE_SIZE)
    .offset((safePage - 1) * INSPECTION_PAGE_SIZE)

  const points = rows.length
    ? await db
        .select({
          reportId: inspectionReportPoints.reportId,
          result: inspectionReportPoints.result,
          severity: inspectionReportPoints.severity
        })
        .from(inspectionReportPoints)
        .where(inArray(inspectionReportPoints.reportId, rows.map(r => r.id)))
    : []

  const items: InspectionListItem[] = rows.map((r) => {
    const tally = tallyInspectionPoints(points.filter(p => p.reportId === r.id))
    const final = r.status === 'closed'
    return {
      id: r.id,
      status: r.status,
      locationType: r.locationType,
      locationName: r.locationName,
      templateName: r.templateName,
      productNo: r.productNo,
      reference: r.reference,
      inspectionDate: r.inspectionDate,
      overall: final ? r.overall : inspectionOverall(tally),
      overallIsFinal: final,
      nonConformances: tally.minor + tally.major,
      createdByName: personName(r.createdByName, r.createdByEmail)
    }
  })

  return { items, total: Number(total), page: safePage, pageSize: INSPECTION_PAGE_SIZE }
}

/* ------------------------------------------------------------------ */
/* Reports: create                                                     */
/* ------------------------------------------------------------------ */

export interface NewInspectionInput {
  locationId: number
  templateId: number
  productNo: string | null
  reference: string | null
  inspectionDate: string
  notes: string | null
}

/** Start a draft from a template: the template's sections and points are copied into the report. */
export async function createInspectionReport(db: Db, userId: string, roles: string[], input: NewInspectionInput) {
  if (!canCreateInspection(roles)) throw new InspectionError(403, 'You need the Inspector role to start a report.')

  const [location] = await db.select().from(inspectionLocations).where(eq(inspectionLocations.id, input.locationId))
  if (!location || !location.active) throw new InspectionError(400, 'Choose a supplier or DC from the list.')
  const [template] = await db.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, input.templateId))
  if (!template || !template.active) throw new InspectionError(400, 'Choose a report template from the list.')

  return db.transaction(async (tx) => {
    const [report] = await tx
      .insert(inspectionReports)
      .values({
        locationId: location.id,
        locationType: location.type,
        locationName: location.name,
        templateId: template.id,
        templateName: template.name,
        productNo: text(input.productNo),
        reference: text(input.reference),
        inspectionDate: input.inspectionDate,
        notes: text(input.notes),
        createdBy: userId
      })
      .returning({ id: inspectionReports.id })
    if (!report) throw new InspectionError(500, 'Could not start the report.')

    const pointRows = template.sections.flatMap((s, si) =>
      s.points.map((p, pi) => ({
        reportId: report.id,
        sectionName: s.name,
        sectionOrder: si,
        pointText: p.text,
        pointOrder: pi
      })))
    if (pointRows.length === 0) throw new InspectionError(400, 'That template has no inspection points yet.')
    await tx.insert(inspectionReportPoints).values(pointRows)
    await tx.insert(inspectionEvents).values({ reportId: report.id, action: 'created', actorId: userId })
    return { id: report.id }
  })
}

/* ------------------------------------------------------------------ */
/* Reports: open one                                                   */
/* ------------------------------------------------------------------ */

export async function getInspectionReport(db: Db, id: number, userId: string, roles: string[]): Promise<InspectionReportView | null> {
  const [r] = await db
    .select({ report: inspectionReports, fullName: profiles.fullName, email: profiles.email })
    .from(inspectionReports)
    .leftJoin(profiles, eq(profiles.id, inspectionReports.createdBy))
    .where(eq(inspectionReports.id, id))
  if (!r) return null

  const pointRows = await db
    .select()
    .from(inspectionReportPoints)
    .where(eq(inspectionReportPoints.reportId, id))
    .orderBy(asc(inspectionReportPoints.sectionOrder), asc(inspectionReportPoints.pointOrder))
  const photoRows = pointRows.length
    ? await db
        .select({
          id: inspectionPhotos.id,
          reportPointId: inspectionPhotos.reportPointId,
          fileName: inspectionPhotos.fileName,
          sizeBytes: inspectionPhotos.sizeBytes
        })
        .from(inspectionPhotos)
        .where(inArray(inspectionPhotos.reportPointId, pointRows.map(p => p.id)))
        .orderBy(asc(inspectionPhotos.id))
    : []
  const eventRows = await db
    .select({
      id: inspectionEvents.id,
      action: inspectionEvents.action,
      comment: inspectionEvents.comment,
      createdAt: inspectionEvents.createdAt,
      fullName: profiles.fullName,
      email: profiles.email
    })
    .from(inspectionEvents)
    .leftJoin(profiles, eq(profiles.id, inspectionEvents.actorId))
    .where(eq(inspectionEvents.reportId, id))
    .orderBy(asc(inspectionEvents.createdAt), asc(inspectionEvents.id))

  const report = r.report
  const tally = tallyInspectionPoints(pointRows)
  const final = report.status === 'closed'
  const isAuthor = report.createdBy === userId

  return {
    id: report.id,
    status: report.status,
    locationId: report.locationId,
    locationType: report.locationType,
    locationName: report.locationName,
    templateName: report.templateName,
    productNo: report.productNo,
    reference: report.reference,
    inspectionDate: report.inspectionDate,
    notes: report.notes,
    createdByName: personName(r.fullName, r.email),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    overall: final && report.overall ? report.overall : inspectionOverall(tally),
    overallIsFinal: final,
    tally,
    hasNonConformance: hasNonConformance(tally),
    submitProblems: inspectionSubmitProblems(pointRows),
    points: pointRows.map(p => ({
      id: p.id,
      sectionName: p.sectionName,
      sectionOrder: p.sectionOrder,
      pointText: p.pointText,
      pointOrder: p.pointOrder,
      result: p.result,
      severity: p.severity,
      comment: p.comment,
      photos: photoRows
        .filter(ph => ph.reportPointId === p.id)
        .map(({ id: photoId, fileName, sizeBytes }) => ({ id: photoId, fileName, sizeBytes }))
    })),
    events: eventRows.map(e => ({
      id: e.id,
      action: e.action,
      actorName: personName(e.fullName, e.email),
      comment: e.comment,
      createdAt: e.createdAt.toISOString()
    })),
    can: {
      edit: canEditInspection(report.status, roles, isAuthor),
      review: report.status === 'in_review' && inspectionTransitionProblem('in_review', 'closed', roles, isAuthor) === '',
      delete: canDeleteInspection(report.status, roles, isAuthor)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reports: save a draft                                               */
/* ------------------------------------------------------------------ */

export interface SaveInspectionInput {
  locationId: number
  productNo: string | null
  reference: string | null
  inspectionDate: string
  notes: string | null
  points: { id: number, result: InspectionPointResult | null, severity: InspectionSeverity | null, comment: string | null }[]
}

/** Save the header and every point answer of a draft in one go. */
export async function saveInspectionDraft(db: Db, id: number, userId: string, roles: string[], input: SaveInspectionInput) {
  return db.transaction(async (tx) => {
    const [report] = await tx.select().from(inspectionReports).where(eq(inspectionReports.id, id)).for('update')
    if (!report) throw new InspectionError(404, 'That inspection report no longer exists.')
    if (report.status !== 'draft') throw new InspectionError(409, 'Only a draft can be edited. This report is now ' + (report.status === 'closed' ? 'closed' : 'in review') + '.')
    if (!canEditInspection(report.status, roles, report.createdBy === userId)) {
      throw new InspectionError(403, 'Only the inspector who started this report can edit it.')
    }

    let locationId = report.locationId
    let locationType = report.locationType
    let locationName = report.locationName
    if (input.locationId !== report.locationId) {
      const [loc] = await tx.select().from(inspectionLocations).where(eq(inspectionLocations.id, input.locationId))
      if (!loc || !loc.active) throw new InspectionError(400, 'Choose a supplier or DC from the list.')
      locationId = loc.id
      locationType = loc.type
      locationName = loc.name
    }

    const existing = await tx
      .select({ id: inspectionReportPoints.id })
      .from(inspectionReportPoints)
      .where(eq(inspectionReportPoints.reportId, id))
    const ownIds = new Set(existing.map(p => p.id))
    const seen = new Set<number>()
    for (const p of input.points) {
      if (!ownIds.has(p.id) || seen.has(p.id)) throw new InspectionError(400, 'An inspection point does not belong to this report.')
      seen.add(p.id)
    }

    await tx
      .update(inspectionReports)
      .set({
        locationId,
        locationType,
        locationName,
        productNo: text(input.productNo),
        reference: text(input.reference),
        inspectionDate: input.inspectionDate,
        notes: text(input.notes),
        updatedAt: new Date()
      })
      .where(eq(inspectionReports.id, id))

    for (const p of input.points) {
      await tx
        .update(inspectionReportPoints)
        .set({
          result: p.result,
          // Minor/Major only belongs to a Non-Conformance.
          severity: p.result === 'non_conformance' ? p.severity : null,
          comment: text(p.comment)
        })
        .where(eq(inspectionReportPoints.id, p.id))
    }
    return { id }
  })
}

/* ------------------------------------------------------------------ */
/* Reports: status changes                                             */
/* ------------------------------------------------------------------ */

export type InspectionAction = 'submit' | 'return' | 'close'

const ACTION_MAP = {
  submit: { from: 'draft', to: 'in_review', event: 'submitted' },
  return: { from: 'in_review', to: 'draft', event: 'returned' },
  close: { from: 'in_review', to: 'closed', event: 'closed' }
} as const

/**
 * Submit (inspector), or send back / close (reviewer). Each change is atomic:
 * the UPDATE only applies while the report is still in the expected status, so
 * two people acting at once can't both succeed.
 */
export async function changeInspectionStatus(
  db: Db,
  id: number,
  userId: string,
  roles: string[],
  action: InspectionAction,
  comment: string | null
) {
  const { from, to, event } = ACTION_MAP[action]
  const note = text(comment)
  if (action === 'return' && !note) throw new InspectionError(400, 'Say what needs changing so the inspector knows what to fix.')

  return db.transaction(async (tx) => {
    const [report] = await tx.select().from(inspectionReports).where(eq(inspectionReports.id, id)).for('update')
    if (!report) throw new InspectionError(404, 'That inspection report no longer exists.')
    if (report.status !== from) {
      throw new InspectionError(409, `This report is ${report.status === 'closed' ? 'closed' : report.status === 'draft' ? 'a draft' : 'in review'}, so that can't be done now. Refresh the page.`)
    }
    const problem = inspectionTransitionProblem(from, to, roles, report.createdBy === userId)
    if (problem) throw new InspectionError(403, problem)

    const points = await tx
      .select({ result: inspectionReportPoints.result, severity: inspectionReportPoints.severity })
      .from(inspectionReportPoints)
      .where(eq(inspectionReportPoints.reportId, id))
    const tally = tallyInspectionPoints(points)

    if (action === 'submit') {
      const problems = inspectionSubmitProblems(points)
      if (problems.length) throw new InspectionError(400, `Can't submit yet: ${problems.join('; ')}.`)
    }

    await tx
      .update(inspectionReports)
      .set({
        status: to,
        overall: action === 'close' ? inspectionOverall(tally) : null,
        updatedAt: new Date()
      })
      .where(and(eq(inspectionReports.id, id), eq(inspectionReports.status, from)))
    await tx.insert(inspectionEvents).values({ reportId: id, action: event, actorId: userId, comment: note })

    return { id, status: to, hasNonConformance: hasNonConformance(tally) }
  })
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export function tidyTemplateSections(sections: { name: string, points: { text: string }[] }[]) {
  return sections.map(s => ({
    name: s.name.replace(/\s+/g, ' ').trim(),
    points: s.points.map(p => ({ text: p.text.replace(/\s+/g, ' ').trim() }))
  }))
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string, cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

/** The point, if it is in this report and the report is a draft this user may edit. */
async function requireEditablePoint(db: Db, reportId: number, pointId: number, userId: string, roles: string[]) {
  const [row] = await db
    .select({ point: inspectionReportPoints, report: inspectionReports })
    .from(inspectionReportPoints)
    .innerJoin(inspectionReports, eq(inspectionReports.id, inspectionReportPoints.reportId))
    .where(and(eq(inspectionReportPoints.id, pointId), eq(inspectionReports.id, reportId)))
  if (!row) throw new InspectionError(404, 'That inspection point no longer exists.')
  assertCanEditPhotos(row.report.status, row.report.createdBy, userId, roles)
  return row
}

function assertCanEditPhotos(status: InspectionStatus, createdBy: string, userId: string, roles: string[]) {
  if (status !== 'draft') throw new InspectionError(409, 'Photos can only be changed while the report is a draft.')
  if (!canEditInspection(status, roles, createdBy === userId)) {
    throw new InspectionError(403, 'Only the inspector who started this report can change its photos.')
  }
}

/** Approve one photo upload: checks type and size, returns a short-lived upload link for exactly that size. */
export async function createInspectionPhotoUpload(
  db: Db,
  reportId: number,
  pointId: number,
  userId: string,
  roles: string[],
  file: { fileName: string, contentType: string, sizeBytes: number }
) {
  await requireEditablePoint(db, reportId, pointId, userId, roles)
  const problem = inspectionPhotoProblem(file.fileName, file.contentType, file.sizeBytes)
  if (problem) throw new InspectionError(400, problem)

  const contentType = inspectionPhotoContentType(file.fileName, file.contentType)
  const key = buildObjectKey(INSPECTION_TOOL_ID, file.fileName)
  const uploadUrl = await getUploadUrl(key, contentType, 300, file.sizeBytes)
  return { uploadUrl, key, contentType }
}

/** After the browser has uploaded: confirm the file really is in R2 at the approved size, then record it. */
export async function registerInspectionPhoto(
  db: Db,
  reportId: number,
  pointId: number,
  userId: string,
  roles: string[],
  file: { key: string, fileName: string, contentType: string }
) {
  await requireEditablePoint(db, reportId, pointId, userId, roles)
  if (!file.key.startsWith(`${INSPECTION_TOOL_ID}/`) || file.key.includes('..')) {
    throw new InspectionError(400, 'That is not an inspection photo.')
  }
  const size = await headObjectSize(file.key)
  if (size === null) throw new InspectionError(400, 'The photo did not finish uploading. Please try again.')
  const contentType = inspectionPhotoContentType(file.fileName, file.contentType)
  const problem = inspectionPhotoProblem(file.fileName, contentType, size)
  if (problem) {
    await deleteObject(file.key).catch(() => {})
    throw new InspectionError(400, problem)
  }
  const [taken] = await db.select({ id: inspectionPhotos.id }).from(inspectionPhotos).where(eq(inspectionPhotos.r2Key, file.key))
  if (taken) throw new InspectionError(409, 'That photo is already attached.')

  const [photo] = await db
    .insert(inspectionPhotos)
    .values({ reportPointId: pointId, r2Key: file.key, fileName: file.fileName.slice(0, 200), contentType, sizeBytes: size, uploadedBy: userId })
    .returning({ id: inspectionPhotos.id, fileName: inspectionPhotos.fileName, sizeBytes: inspectionPhotos.sizeBytes })
  return photo
}

/** Remove a photo from a draft (the stored file is deleted too, best effort). */
export async function deleteInspectionPhoto(db: Db, reportId: number, photoId: number, userId: string, roles: string[]) {
  const [row] = await db
    .select({ photo: inspectionPhotos, report: inspectionReports })
    .from(inspectionPhotos)
    .innerJoin(inspectionReportPoints, eq(inspectionReportPoints.id, inspectionPhotos.reportPointId))
    .innerJoin(inspectionReports, eq(inspectionReports.id, inspectionReportPoints.reportId))
    .where(and(eq(inspectionPhotos.id, photoId), eq(inspectionReports.id, reportId)))
  if (!row) throw new InspectionError(404, 'That photo no longer exists.')
  assertCanEditPhotos(row.report.status, row.report.createdBy, userId, roles)

  await db.delete(inspectionPhotos).where(eq(inspectionPhotos.id, photoId))
  await deleteObject(row.photo.r2Key).catch(() => {})
  return { id: photoId }
}

/** Short-lived view links for every photo in a report, keyed by photo id. */
export async function inspectionPhotoUrls(db: Db, reportId: number): Promise<Record<number, string>> {
  const rows = await db
    .select({ id: inspectionPhotos.id, r2Key: inspectionPhotos.r2Key })
    .from(inspectionPhotos)
    .innerJoin(inspectionReportPoints, eq(inspectionReportPoints.id, inspectionPhotos.reportPointId))
    .where(eq(inspectionReportPoints.reportId, reportId))
  const urls: Record<number, string> = {}
  await Promise.all(rows.map(async (r) => {
    urls[r.id] = await getDownloadUrl(r.r2Key, 900)
  }))
  return urls
}

/* ------------------------------------------------------------------ */
/* Delete / discard                                                    */
/* ------------------------------------------------------------------ */

/** Delete a report with its points, photos and history. An inspector may only discard their own draft. */
export async function deleteInspectionReport(db: Db, id: number, userId: string, roles: string[]) {
  const [report] = await db
    .select({ status: inspectionReports.status, createdBy: inspectionReports.createdBy })
    .from(inspectionReports)
    .where(eq(inspectionReports.id, id))
  if (!report) throw new InspectionError(404, 'That inspection report no longer exists.')
  if (!canDeleteInspection(report.status, roles, report.createdBy === userId)) {
    throw new InspectionError(403, report.status === 'draft'
      ? 'Only the inspector who started this draft (or an admin) can discard it.'
      : 'Only an admin can delete a report that has been submitted.')
  }

  const photos = await db
    .select({ r2Key: inspectionPhotos.r2Key })
    .from(inspectionPhotos)
    .innerJoin(inspectionReportPoints, eq(inspectionReportPoints.id, inspectionPhotos.reportPointId))
    .where(eq(inspectionReportPoints.reportId, id))

  // Only deletes while the status is still what we checked, so a report that has just been submitted is not lost.
  const deleted = await db
    .delete(inspectionReports)
    .where(and(eq(inspectionReports.id, id), eq(inspectionReports.status, report.status)))
    .returning({ id: inspectionReports.id })
  if (!deleted[0]) throw new InspectionError(409, 'This report has just changed, so it was not deleted. Refresh the page.')

  await Promise.all(photos.map(p => deleteObject(p.r2Key).catch(() => {})))
  return { id }
}
