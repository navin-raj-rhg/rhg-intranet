import type {
  InspectionLocationType,
  InspectionOverall,
  InspectionPointResult,
  InspectionSeverity,
  InspectionStatus,
  InspectionTally
} from '../utils/inspectionRules'

/** What the Inspection Reporting API returns (shared by the server routes and the screens). */

export interface InspectionMyRoleResponse {
  roles: string[]
  isAdmin: boolean
  canCreate: boolean
  isReviewer: boolean
}

export interface InspectionLocationItem {
  id: number
  type: InspectionLocationType
  name: string
  active: boolean
}

export interface InspectionListItem {
  id: number
  status: InspectionStatus
  locationType: InspectionLocationType
  locationName: string
  templateName: string
  productNo: string | null
  reference: string | null
  inspectionDate: string
  overall: InspectionOverall | null
  overallIsFinal: boolean
  nonConformances: number
  createdByName: string
}

export interface InspectionListResponse {
  items: InspectionListItem[]
  total: number
  page: number
  pageSize: number
}

export interface InspectionPointView {
  id: number
  sectionName: string
  sectionOrder: number
  pointText: string
  pointOrder: number
  result: InspectionPointResult | null
  severity: InspectionSeverity | null
  comment: string | null
  photos: { id: number, fileName: string, sizeBytes: number }[]
}

export interface InspectionReportView {
  id: number
  status: InspectionStatus
  locationId: number | null
  locationType: InspectionLocationType
  locationName: string
  templateName: string
  productNo: string | null
  reference: string | null
  inspectionDate: string
  notes: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
  overall: InspectionOverall
  overallIsFinal: boolean
  tally: InspectionTally
  hasNonConformance: boolean
  submitProblems: string[]
  points: InspectionPointView[]
  events: { id: number, action: string, actorName: string, comment: string | null, createdAt: string }[]
  can: { edit: boolean, review: boolean, delete: boolean }
}

export interface InspectionTemplateListItem {
  id: number
  name: string
  active: boolean
  sectionCount: number
  pointCount: number
  updatedAt: string
}

export interface InspectionTemplateResponse {
  id: number
  name: string
  active: boolean
  sections: { name: string, points: { text: string }[] }[]
  updatedAt: string
}
