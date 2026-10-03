// Shapes the Product Information API returns (Step 17.4). Shared with the screens.
import type { PimAttributeType, PimCompleteness, PimFileKind, PimSupplier, PimStatus } from '../utils/pimRules'

export type PimPackagingLevelKey = 'carton' | 'outer' | 'pallet'

export interface PimAttributeItem {
  id: number
  categoryId: number
  name: string
  type: PimAttributeType
  options: string[] | null
  required: boolean
  active: boolean
}

export interface PimSubCategoryItem {
  id: number
  name: string
  active: boolean
}

export interface PimCategoryItem {
  id: number
  name: string
  active: boolean
  /** Built-in fields that count towards completeness for this category's products. */
  requiredFields: string[]
  subCategories: PimSubCategoryItem[]
  attributes: PimAttributeItem[]
  productCount: number
}

export interface PimPackagingItem {
  level: PimPackagingLevelKey
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  weightKg: string | null
  qtyInside: number | null
}

export interface PimFileItem {
  id: number
  kind: PimFileKind
  fileName: string
  contentType: string
  sizeBytes: number
  isMain: boolean
  /** Short-lived link (15 minutes); the page refreshes it when reloaded. */
  url: string
  createdAt: string
}

export interface PimListItem {
  id: number
  productNo: string
  name: string
  status: PimStatus
  brand: string | null
  categoryName: string | null
  subCategoryName: string | null
  primarySupplier: string | null
  supplierCount: number
  rrp: string | null
  mainImageUrl: string | null
  completenessPercent: number
  updatedAt: string
}

export interface PimListResponse {
  items: PimListItem[]
  total: number
  page: number
  pageSize: number
}

export interface PimProductView {
  id: number
  productNo: string
  name: string
  status: PimStatus
  brand: string | null
  categoryId: number | null
  subCategoryId: number | null
  shortDescription: string | null
  longDescription: string | null
  barcode: string | null
  rrp: string | null
  suppliers: PimSupplier[]
  packaging: PimPackagingItem[]
  /** Attribute id -> stored value. */
  attributeValues: Record<number, string>
  files: PimFileItem[]
  completeness: PimCompleteness
  createdByName: string | null
  updatedByName: string | null
  createdAt: string
  updatedAt: string
}

export interface PimHistoryItem {
  id: number
  summary: string
  changes: { field: string, from: string, to: string }[]
  changedByName: string | null
  createdAt: string
}

export interface PimImportResponse {
  created: number
  updated: number
  /** Problems found; if any, nothing was (or will be) imported. */
  problems: string[]
  applied: boolean
}
