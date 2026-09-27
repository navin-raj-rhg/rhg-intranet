export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  travel_national: 'Travel – National',
  travel_international: 'Travel – International',
  parking: 'Parking',
  staff_wellness_day: 'Staff Wellness Day',
  office_refreshments_amenities: 'Office Refreshments and Amenities',
  medical_claim: 'Medical Claim',
  entertainment: 'Entertainment'
}

export const EXPENSE_CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label })
)
