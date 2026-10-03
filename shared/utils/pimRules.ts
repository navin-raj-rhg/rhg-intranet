/**
 * Pure rules for Product Information Management (Step 17.2): product number and
 * field checks, suppliers, attribute values, the completeness score, file rules
 * and CSV import / export. Shared by the server (which enforces them) and the
 * screens. No database, no Vue.
 */
import { projectFileContentType, projectFileProblem } from './projectFiles.ts'

export const PIM_PRODUCT_NO_MAX = 40
export const PIM_NAME_MAX = 200
export const PIM_SHORT_DESC_MAX = 300
export const PIM_LONG_DESC_MAX = 5000
export const PIM_SHORT_TEXT_MAX = 100
export const PIM_MAX_SUPPLIERS = 10

export const PIM_STATUSES = ['draft', 'active', 'discontinued'] as const
export type PimStatus = typeof PIM_STATUSES[number]

export const PIM_STATUS_LABELS: Record<PimStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  discontinued: 'Discontinued'
}

export const PIM_ATTRIBUTE_TYPES = ['text', 'number', 'yesno', 'list'] as const
export type PimAttributeType = typeof PIM_ATTRIBUTE_TYPES[number]

export const PIM_ATTRIBUTE_TYPE_LABELS: Record<PimAttributeType, string> = {
  text: 'Text',
  number: 'Number',
  yesno: 'Yes / No',
  list: 'Pick-list'
}

/** Trim and collapse runs of spaces. Case is kept as typed. */
export function tidyPimText(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim()
}

/** Product numbers are unique ignoring case and spacing. */
export function pimProductNoKey(raw: string): string {
  return tidyPimText(raw).toLowerCase()
}

export function pimProductNoProblem(raw: string): string {
  const no = tidyPimText(raw)
  if (!no) return 'Product number can\'t be blank'
  if (no.length > PIM_PRODUCT_NO_MAX) return `Product number must be ${PIM_PRODUCT_NO_MAX} characters or fewer`
  return ''
}

export function pimNameProblem(raw: string, what = 'Name', max = PIM_NAME_MAX): string {
  const name = tidyPimText(raw)
  if (!name) return `${what} can't be blank`
  if (name.length > max) return `${what} must be ${max} characters or fewer`
  return ''
}

/** Optional text: '' if fine, else a plain message. Line breaks are allowed in descriptions. */
export function pimOptionalTextProblem(raw: string | null | undefined, what: string, max: number): string {
  if ((raw ?? '').trim().length > max) return `${what} must be ${max} characters or fewer`
  return ''
}

export function isPimStatus(value: unknown): value is PimStatus {
  return typeof value === 'string' && (PIM_STATUSES as readonly string[]).includes(value)
}

/** Digits only, 8, 12, 13 or 14 long, with a correct check digit (GTIN-8/12/13/14). Blank is fine. */
export function pimBarcodeProblem(raw: string | null | undefined): string {
  const code = (raw ?? '').replace(/\s+/g, '')
  if (!code) return ''
  if (!/^\d+$/.test(code)) return 'Barcode must be digits only'
  if (![8, 12, 13, 14].includes(code.length)) return 'Barcode must be 8, 12, 13 or 14 digits'
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  let sum = 0
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1)
  })
  return (10 - (sum % 10)) % 10 === check ? '' : 'That barcode\'s check digit is wrong - please re-check it'
}

/** RRP and other money: blank or a number of 0 or more, at most 2 decimals. */
export function pimMoneyProblem(raw: string | number | null | undefined, what: string): string {
  if (raw === null || raw === undefined || String(raw).trim() === '') return ''
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return `${what} must be a number, 0 or more`
  if (Math.round(n * 100) / 100 !== n) return `${what} can have at most 2 decimal places`
  return ''
}

/** Measurements and weights: blank or a number above 0. */
export function pimMeasureProblem(raw: string | number | null | undefined, what: string): string {
  if (raw === null || raw === undefined || String(raw).trim() === '') return ''
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return `${what} must be a number above 0`
  return ''
}

/** Whole number of 1 or more, blank allowed (e.g. qty inside a carton). */
export function pimQuantityProblem(raw: string | number | null | undefined, what: string): string {
  if (raw === null || raw === undefined || String(raw).trim() === '') return ''
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return `${what} must be a whole number, 1 or more`
  return ''
}

// ---------------------------------------------------------------- Suppliers

export interface PimSupplierInput {
  name: string
  /** The supplier's own code for the product, optional. */
  supplierCode?: string | null
  isPrimary?: boolean
}

export interface PimSupplier {
  name: string
  supplierCode: string | null
  isPrimary: boolean
}

/**
 * Tidies a product's supplier list: removes blanks and repeats (ignoring case),
 * and makes sure exactly one is primary (the first marked, else the first listed).
 */
export function normalisePimSuppliers(list: PimSupplierInput[]): PimSupplier[] {
  const seen = new Set<string>()
  const out: PimSupplier[] = []
  for (const s of list) {
    const name = tidyPimText(s.name)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({ name, supplierCode: tidyPimText(s.supplierCode) || null, isPrimary: !!s.isPrimary })
  }
  const primaryAt = Math.max(0, out.findIndex(s => s.isPrimary))
  return out.map((s, i) => ({ ...s, isPrimary: i === primaryAt }))
}

export function pimSuppliersProblem(list: PimSupplierInput[]): string {
  const named = list.filter(s => tidyPimText(s.name))
  if (named.length > PIM_MAX_SUPPLIERS) return `A product can have at most ${PIM_MAX_SUPPLIERS} suppliers`
  for (const s of named) {
    if (tidyPimText(s.name).length > PIM_SHORT_TEXT_MAX) return `Supplier names must be ${PIM_SHORT_TEXT_MAX} characters or fewer`
    if (tidyPimText(s.supplierCode).length > PIM_SHORT_TEXT_MAX) return `Supplier codes must be ${PIM_SHORT_TEXT_MAX} characters or fewer`
  }
  return ''
}

// --------------------------------------------------------------- Attributes

export interface PimAttributeDef {
  id: number
  name: string
  type: PimAttributeType
  /** Choices, for 'list' attributes. */
  options?: string[] | null
  /** Counts towards the completeness score for products in the category. */
  required?: boolean
}

/** Plain-English problem with an attribute definition, or ''. */
export function pimAttributeDefProblem(def: { name: string, type: string, options?: string[] | null }): string {
  const nameProblem = pimNameProblem(def.name, 'Attribute name', PIM_SHORT_TEXT_MAX)
  if (nameProblem) return nameProblem
  if (!(PIM_ATTRIBUTE_TYPES as readonly string[]).includes(def.type)) return 'Pick a type for the attribute'
  if (def.type === 'list') {
    const options = (def.options ?? []).map(tidyPimText).filter(Boolean)
    if (options.length < 2) return 'A pick-list needs at least 2 choices'
    if (new Set(options.map(o => o.toLowerCase())).size !== options.length) return 'Pick-list choices must all be different'
    if (options.some(o => o.length > PIM_SHORT_TEXT_MAX)) return `Choices must be ${PIM_SHORT_TEXT_MAX} characters or fewer`
  }
  return ''
}

/**
 * Checks one attribute value against its definition and returns the value as it
 * should be stored (always text; yes/no stored as 'yes' / 'no'; numbers as typed
 * but tidied), or the problem. A blank value is always allowed (means "not set").
 */
export function checkPimAttributeValue(
  def: Pick<PimAttributeDef, 'name' | 'type' | 'options'>,
  raw: string | number | boolean | null | undefined
): { value: string | null, problem: string } {
  if (raw === null || raw === undefined) return { value: null, problem: '' }
  const text = typeof raw === 'boolean' ? (raw ? 'yes' : 'no') : tidyPimText(String(raw))
  if (text === '') return { value: null, problem: '' }
  switch (def.type) {
    case 'text':
      if (text.length > PIM_LONG_DESC_MAX) return { value: null, problem: `${def.name} is too long` }
      return { value: text, problem: '' }
    case 'number': {
      const n = Number(text)
      if (!Number.isFinite(n)) return { value: null, problem: `${def.name} must be a number` }
      return { value: String(n), problem: '' }
    }
    case 'yesno': {
      const t = text.toLowerCase()
      if (['yes', 'y', 'true'].includes(t)) return { value: 'yes', problem: '' }
      if (['no', 'n', 'false'].includes(t)) return { value: 'no', problem: '' }
      return { value: null, problem: `${def.name} must be Yes or No` }
    }
    case 'list': {
      const match = (def.options ?? []).map(tidyPimText).find(o => o.toLowerCase() === text.toLowerCase())
      if (!match) return { value: null, problem: `${def.name} must be one of: ${(def.options ?? []).join(', ')}` }
      return { value: match, problem: '' }
    }
    default:
      return { value: null, problem: `${def.name} has an unknown type` }
  }
}

// ------------------------------------------------------------- Completeness

/** The built-in fields a category can require, with the label shown in "missing". */
export const PIM_REQUIRABLE_FIELDS = {
  shortDescription: 'Short description',
  longDescription: 'Long description',
  brand: 'Brand',
  supplier: 'Supplier',
  barcode: 'Barcode',
  rrp: 'RRP',
  mainImage: 'Main image',
  packaging: 'Packaging details'
} as const
export type PimRequirableField = keyof typeof PIM_REQUIRABLE_FIELDS

export interface PimCompletenessInput {
  shortDescription?: string | null
  longDescription?: string | null
  brand?: string | null
  supplierCount?: number
  barcode?: string | null
  rrp?: string | number | null
  imageCount?: number
  /** True when at least one packaging level has dimensions or a weight. */
  hasPackaging?: boolean
  /** Attribute id -> stored value. */
  attributeValues?: Record<number, string | null | undefined>
}

export interface PimCompleteness {
  filled: number
  total: number
  /** Whole percent, 100 when nothing is required. */
  percent: number
  missing: string[]
}

function hasText(v: string | number | null | undefined): boolean {
  return v !== null && v !== undefined && String(v).trim() !== ''
}

/** "x of y required fields filled" for one product. */
export function pimCompleteness(
  product: PimCompletenessInput,
  requiredFields: PimRequirableField[],
  requiredAttributes: Pick<PimAttributeDef, 'id' | 'name'>[]
): PimCompleteness {
  const present: Record<PimRequirableField, boolean> = {
    shortDescription: hasText(product.shortDescription),
    longDescription: hasText(product.longDescription),
    brand: hasText(product.brand),
    supplier: (product.supplierCount ?? 0) > 0,
    barcode: hasText(product.barcode),
    rrp: hasText(product.rrp),
    mainImage: (product.imageCount ?? 0) > 0,
    packaging: !!product.hasPackaging
  }
  const missing: string[] = []
  let filled = 0
  const fields = [...new Set(requiredFields)]
  for (const f of fields) {
    if (present[f]) filled++
    else missing.push(PIM_REQUIRABLE_FIELDS[f])
  }
  for (const a of requiredAttributes) {
    if (hasText(product.attributeValues?.[a.id])) filled++
    else missing.push(a.name)
  }
  const total = fields.length + requiredAttributes.length
  return { filled, total, percent: total === 0 ? 100 : Math.round((filled / total) * 100), missing }
}

// -------------------------------------------------------------------- Files

export const PIM_FILE_KINDS = ['image', 'document'] as const
export type PimFileKind = typeof PIM_FILE_KINDS[number]

/** Same size and type rules as Projects (20 MB; images, PDF, Office, CSV, text, ZIP). */
export function pimFileProblem(fileName: string, sizeBytes: number, kind: PimFileKind): string {
  const problem = projectFileProblem(fileName, sizeBytes)
  if (problem) return problem
  if (kind === 'image' && !projectFileContentType(fileName).startsWith('image/')) {
    return 'Images must be JPEG, PNG, HEIC, WebP or GIF files'
  }
  return ''
}

/** Where a new image sits in the gallery: first image becomes the main one. */
export function pimNextImageIsMain(existingImageCount: number): boolean {
  return existingImageCount === 0
}

// ---------------------------------------------------------------------- CSV

/** The columns of the product CSV, in order. Import and export use the same ones. */
export const PIM_CSV_COLUMNS = [
  'Product number', 'Name', 'Status', 'Brand', 'Category', 'Sub-category', 'Suppliers',
  'Short description', 'Long description', 'Barcode', 'RRP'
] as const

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, commas and line breaks in cells. */
export function parsePimCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value)
  // Stop spreadsheets treating text as a formula.
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Builds CSV text (with a header row) from rows of cells. */
export function buildPimCsv(rows: (string | number | null | undefined)[][], header: readonly string[] = PIM_CSV_COLUMNS): string {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export interface PimImportRow {
  /** 2 = first data row, matching the row number in a spreadsheet. */
  line: number
  productNo: string
  name: string
  status: PimStatus
  brand: string | null
  category: string | null
  subCategory: string | null
  suppliers: PimSupplier[]
  shortDescription: string | null
  longDescription: string | null
  barcode: string | null
  rrp: string | null
}

export interface PimImportResult {
  rows: PimImportRow[]
  /** Plain-English problems, each naming the spreadsheet row. Any problem means nothing should be imported. */
  problems: string[]
}

const importHeaderKey = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

/** Suppliers in a CSV cell are separated by semicolons; a code can follow a colon ("Acme: AB-12"). The first is primary. */
export function parsePimSuppliersCell(raw: string): PimSupplier[] {
  return normalisePimSuppliers(raw.split(';').map((part, i) => {
    const [name, ...code] = part.split(':')
    return { name: name ?? '', supplierCode: code.join(':'), isPrimary: i === 0 }
  }))
}

/** Turns an uploaded CSV into checked rows. Only "Product number" and "Name" columns are required. */
export function readPimImport(text: string, maxRows = 2000): PimImportResult {
  const table = parsePimCsv(text)
  const problems: string[] = []
  if (table.length === 0) return { rows: [], problems: ['The file is empty'] }
  const header = table[0]!.map(importHeaderKey)
  const col = (name: string) => header.indexOf(importHeaderKey(name))
  for (const need of ['Product number', 'Name']) {
    if (col(need) < 0) problems.push(`The file needs a "${need}" column`)
  }
  if (problems.length) return { rows: [], problems }
  const data = table.slice(1)
  if (data.length === 0) return { rows: [], problems: ['The file has a header row but no products'] }
  if (data.length > maxRows) return { rows: [], problems: [`Import at most ${maxRows} products at a time`] }

  const get = (cells: string[], name: string) => {
    const i = col(name)
    return i < 0 ? '' : (cells[i] ?? '')
  }
  const rows: PimImportRow[] = []
  const seen = new Map<string, number>()
  data.forEach((cells, idx) => {
    const line = idx + 2
    const fail = (msg: string) => problems.push(`Row ${line}: ${msg}`)
    const productNo = tidyPimText(get(cells, 'Product number'))
    const name = tidyPimText(get(cells, 'Name'))
    const before = problems.length
    const noProblem = pimProductNoProblem(productNo)
    if (noProblem) fail(noProblem)
    else {
      const key = pimProductNoKey(productNo)
      if (seen.has(key)) fail(`product number "${productNo}" is also on row ${seen.get(key)}`)
      else seen.set(key, line)
    }
    const nameProblem = pimNameProblem(name)
    if (nameProblem) fail(nameProblem)

    const statusText = tidyPimText(get(cells, 'Status')).toLowerCase()
    let status: PimStatus = 'draft'
    if (statusText) {
      if (isPimStatus(statusText)) status = statusText
      else fail('Status must be Draft, Active or Discontinued')
    }
    const barcode = get(cells, 'Barcode').replace(/\s+/g, '')
    const barcodeProblem = pimBarcodeProblem(barcode)
    if (barcodeProblem) fail(barcodeProblem)
    const rrp = tidyPimText(get(cells, 'RRP'))
    const rrpProblem = pimMoneyProblem(rrp, 'RRP')
    if (rrpProblem) fail(rrpProblem)
    const suppliers = parsePimSuppliersCell(get(cells, 'Suppliers'))
    const supplierProblem = pimSuppliersProblem(suppliers)
    if (supplierProblem) fail(supplierProblem)
    const shortDescription = get(cells, 'Short description').trim()
    const longDescription = get(cells, 'Long description').trim()
    const brand = tidyPimText(get(cells, 'Brand'))
    for (const p of [
      pimOptionalTextProblem(shortDescription, 'Short description', PIM_SHORT_DESC_MAX),
      pimOptionalTextProblem(longDescription, 'Long description', PIM_LONG_DESC_MAX),
      pimOptionalTextProblem(brand, 'Brand', PIM_SHORT_TEXT_MAX)
    ]) if (p) fail(p)
    const category = tidyPimText(get(cells, 'Category'))
    const subCategory = tidyPimText(get(cells, 'Sub-category'))
    if (subCategory && !category) fail('a sub-category needs a category')

    if (problems.length === before) {
      rows.push({
        line, productNo, name, status,
        brand: brand || null,
        category: category || null,
        subCategory: subCategory || null,
        suppliers,
        shortDescription: shortDescription || null,
        longDescription: longDescription || null,
        barcode: barcode || null,
        rrp: rrp || null
      })
    }
  })
  return { rows: problems.length ? [] : rows, problems }
}

// ------------------------------------------------------------------ History

export interface PimFieldChange {
  field: string
  from: string
  to: string
}

/** Compares old and new values of labelled fields and lists what changed (for the change history). */
export function pimChanges(
  before: Record<string, string | number | null | undefined>,
  after: Record<string, string | number | null | undefined>
): PimFieldChange[] {
  const norm = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v).trim())
  const out: PimFieldChange[] = []
  for (const field of Object.keys(after)) {
    const from = norm(before[field])
    const to = norm(after[field])
    if (from !== to) out.push({ field, from, to })
  }
  return out
}

/** One line for the history list, e.g. `Name: "Old" → "New"`. */
export function describePimChange(c: PimFieldChange): string {
  const show = (v: string) => (v === '' ? '(blank)' : v.length > 60 ? `${v.slice(0, 57)}...` : v)
  return `${c.field}: ${show(c.from)} → ${show(c.to)}`
}

/** A starter CSV for people to fill in: the header row plus one example row. */
export function pimCsvTemplate(): string {
  return buildPimCsv([[
    'CL-100', 'Clamp 100mm', 'active', 'Acme', 'Hand tools', 'Clamps', 'Supplier A: A-100; Supplier B',
    'Steel clamp, 100mm', 'Longer description here.', '9300675024235', '19.95'
  ]])
}
