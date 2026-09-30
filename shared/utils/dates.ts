/**
 * Display formatting for dates (Malaysian dd/mm/yyyy). Dates are stored and
 * sent as ISO 'YYYY-MM-DD' everywhere; only what a person SEES is formatted.
 * Fixed format on purpose: it must not change with the browser's language.
 * Anything that isn't a valid ISO date is returned unchanged.
 */
export function formatDateMY(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}

/** '05/10/2026' for one day, '05/10/2026 - 09/10/2026' for a range. */
export function formatDateRangeMY(startIso: string, endIso: string): string {
  return startIso === endIso
    ? formatDateMY(startIso)
    : `${formatDateMY(startIso)} - ${formatDateMY(endIso)}`
}
