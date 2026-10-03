import { z } from 'zod'
import { PIM_FILE_KINDS, PIM_STATUSES } from '~~/shared/utils/pimRules'

const optionalText = z.string().max(20000, 'That text is too long.').nullable().optional()
const numberish = z.union([z.string().max(40), z.number(), z.null()]).optional()

const packagingLevel = z
  .object({
    lengthCm: numberish,
    widthCm: numberish,
    heightCm: numberish,
    weightKg: numberish,
    qtyInside: numberish
  })
  .optional()
  .nullable()

export const pimProductBodySchema = z.object({
  productNo: z.string({ message: 'The product needs a product number' }).max(200),
  name: z.string({ message: 'The product needs a name' }).max(1000),
  status: z.enum(PIM_STATUSES, { message: 'Pick a status' }).default('draft'),
  brand: optionalText,
  categoryId: z.number().int().positive().nullable().optional(),
  subCategoryId: z.number().int().positive().nullable().optional(),
  shortDescription: optionalText,
  longDescription: optionalText,
  barcode: optionalText,
  rrp: numberish,
  suppliers: z
    .array(z.object({
      name: z.string().max(500),
      supplierCode: z.string().max(500).nullable().optional(),
      isPrimary: z.boolean().optional()
    }))
    .max(50)
    .default([]),
  packaging: z.object({ carton: packagingLevel, outer: packagingLevel, pallet: packagingLevel }).default({}),
  // Attribute id (as text) -> value.
  attributes: z.record(z.string(), z.union([z.string().max(20000), z.number(), z.boolean(), z.null()])).default({})
})
export type PimProductBody = z.infer<typeof pimProductBodySchema>

export const pimCategoryCreateSchema = z.object({
  name: z.string({ message: 'The category needs a name' }).max(500),
  parentId: z.number().int().positive().nullable().optional()
})

export const pimCategoryUpdateSchema = z.object({
  name: z.string({ message: 'The category needs a name' }).max(500),
  active: z.boolean().default(true),
  requiredFields: z.array(z.string().max(40)).max(20).optional()
})

export const pimAttributeCreateSchema = z.object({
  categoryId: z.number({ message: 'Pick a category' }).int().positive(),
  name: z.string({ message: 'The attribute needs a name' }).max(500),
  type: z.string({ message: 'Pick a type for the attribute' }).max(20),
  options: z.array(z.string().max(500)).max(100).nullable().optional(),
  required: z.boolean().default(false)
})

export const pimAttributeUpdateSchema = z.object({
  name: z.string({ message: 'The attribute needs a name' }).max(500),
  options: z.array(z.string().max(500)).max(100).nullable().optional(),
  required: z.boolean().default(false),
  active: z.boolean().default(true)
})

export const pimFileUploadSchema = z.object({
  fileName: z.string({ message: 'Choose a file' }).min(1, 'Choose a file').max(255),
  sizeBytes: z.number({ message: 'Choose a file' }).int(),
  kind: z.enum(PIM_FILE_KINDS, { message: 'Say whether this is an image or a document' })
})

export const pimFileRegisterSchema = z.object({
  key: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  kind: z.enum(PIM_FILE_KINDS, { message: 'Say whether this is an image or a document' })
})

export const pimImportSchema = z.object({
  csv: z.string({ message: 'Choose a CSV file' }).max(10_000_000, 'That file is too big.'),
  apply: z.boolean().default(false)
})
