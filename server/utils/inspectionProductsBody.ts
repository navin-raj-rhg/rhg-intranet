import { z } from 'zod'

/**
 * The products part of a report body. Only the size is limited here (so a
 * huge payload is refused early); the plain-English rules (blank rows, a
 * description with no number, duplicates, the 20 product limit) are checked
 * after tidying by inspectionProductsProblem.
 */
export const productsBodySchema = z
  .array(z.object({
    productNo: z.string().max(300),
    description: z.string().max(2000).nullable().optional()
  }))
  .max(100)
