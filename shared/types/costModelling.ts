import type { CostFactorsData } from '../utils/costFactors'

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
