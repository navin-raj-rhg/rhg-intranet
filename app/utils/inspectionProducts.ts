/**
 * Form helpers for the products on an inspection report (Step 12.8): each row
 * on screen carries a `key` so Vue can track it while it's being typed into.
 */

export interface InspectionProductRow {
  key: number
  productNo: string
  description: string
}

let nextProductRowKey = 1

export function blankInspectionProductRow(): InspectionProductRow {
  return { key: nextProductRowKey++, productNo: '', description: '' }
}

export function inspectionProductRowsFrom(products: { productNo: string, description: string | null }[]): InspectionProductRow[] {
  return products.map(p => ({ key: nextProductRowKey++, productNo: p.productNo, description: p.description ?? '' }))
}

/** What is sent to the server (blank rows are dropped there). */
export function inspectionProductsPayload(rows: InspectionProductRow[]) {
  return rows.map(r => ({ productNo: r.productNo, description: r.description }))
}
