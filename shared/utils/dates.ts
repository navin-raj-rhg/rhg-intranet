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

/**
 * Reads what a person types as a Malaysian date (day first) and returns ISO
 * 'YYYY-MM-DD', or null if it is not a real date. Accepts 30/09/2026,
 * 30-09-2026, 30.09.2026 and 1/9/2026 (day and month may be one or two
 * digits; the year must be four). It never guesses month-first: 03/04/2026
 * is 3 April.
 */
export function parseDateMY(text: string): string | null {
  const match = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text)
  if (!match) return null
  const d = Number(match[1])
  const m = Number(match[2])
  const y = Number(match[3])
  const check = new Date(Date.UTC(y, m - 1, d))
  // Rejects 31/02/2026 and the like, which JS would silently roll over.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
