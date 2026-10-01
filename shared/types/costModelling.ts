import type { CostFactorsData } from '../utils/costFactors'
import type { ContainerSize, CostFactorsSnapshot, CostRowInput, CostRowResult } from '../utils/costModel'

/** Response shapes of the Cost Modelling API, shared by its screens. */

export interface CostMyRoleResponse {
  roles: string[]
  /** Admin or owner: can edit Factors and delete models. */
  isAdmin: boolean
}

export interface CostFactorsResponse extends CostFactorsData {
  canEdit: boolean
  /** '' when models can be costed; otherwise a plain explanation. */
  notReadyReason: string
}

/** One product row as the screen sends it: the maths inputs plus its labels. */
export interface CostModelRowInput extends CostRowInput {
  productNo: string | null
  description: string | null
}

/** POST /api/tools/cost-modelling/models */
export interface SaveCostModelBody {
  supplierName: string
  categoryId: number
  subCategoryId: number | null
  originPortId: number
  containerBasis: ContainerSize
  notes?: string | null
  /** The model this was duplicated from, if any. */
  duplicatedFromId?: number | null
  /** settings.updatedAt of the Factors the screen calculated with. */
  factorsUpdatedAt: string
  rows: CostModelRowInput[]
}

export interface CostModelListItem {
  id: number
  name: string
  supplierName: string
  categoryName: string
  subCategoryName: string | null
  originCode: string
  containerBasis: ContainerSize
  rowCount: number
  createdAt: string
  createdByName: string
}

export interface CostModelListResponse {
  items: CostModelListItem[]
  total: number
  page: number
  pageSize: number
}

export interface CostModelSavedRow extends CostModelRowInput {
  id: number
  results: CostRowResult
}

export interface CostModelDetail {
  id: number
  name: string
  supplierName: string
  categoryId: number
  categoryName: string
  subCategoryId: number | null
  subCategoryName: string | null
  originPortId: number
  containerBasis: ContainerSize
  notes: string | null
  duplicatedFrom: { id: number, name: string } | null
  factorsSnapshot: CostFactorsSnapshot
  rows: CostModelSavedRow[]
  createdAt: string
  createdByName: string
  /** Admin or owner. */
  canDelete: boolean
}

/** GET /api/tools/cost-modelling/products?q= (Step 11.8d) */
export interface CostProductSuggestion {
  productNo: string
  description: string | null
  /** Everything as last saved, ready to fill a form row. */
  input: CostModelRowInput
  modelId: number
  modelName: string
  supplierName: string
  savedAt: string
}

/** GET /api/tools/cost-modelling/setup (admins; Step 13.6b) */
export interface CostSetupResponse {
  categories: {
    id: number
    name: string
    modelCount: number
    subCategories: { id: number, name: string, modelCount: number }[]
  }[]
  ports: {
    id: number
    kind: 'origin' | 'destination'
    code: string
    name: string
    active: boolean
    modelCount: number
  }[]
  feeTypes: { id: number, name: string, active: boolean }[]
}
