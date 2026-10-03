/**
 * Rules for the dashboard's Upcoming events (Step 18): checking an event the
 * owner types in, and picking what the widget shows (events plus public
 * holidays). Pure logic. Dates are ISO 'YYYY-MM-DD'; 'time' is 'HH:MM'.
 */

export const EVENT_TITLE_MAX = 120
export const EVENT_PLACE_MAX = 120
export const EVENT_NOTE_MAX = 500
export const UPCOMING_EVENTS_SHOWN = 5

export interface EventInput {
  title: string
  date: string
  endDate: string | null
  time: string | null
  place: string | null
  note: string | null
}

export interface UpcomingItem {
  key: string
  kind: 'event' | 'holiday'
  title: string
  date: string
  endDate: string | null
  time: string | null
  place: string | null
  note: string | null
}

function isRealIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** Plain-English problem with an event, or '' if it is fine. */
export function eventProblem(e: EventInput): string {
  const title = e.title.trim()
  if (!title) return 'Give the event a title'
  if (title.length > EVENT_TITLE_MAX) return `The title must be ${EVENT_TITLE_MAX} characters or fewer`
  if (!isRealIsoDate(e.date)) return 'Choose a valid date'
  if (e.endDate) {
    if (!isRealIsoDate(e.endDate)) return 'Choose a valid end date'
    if (e.endDate < e.date) return 'The end date can\'t be before the start date'
  }
  if (e.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) return 'Enter the time as hours and minutes, for example 14:30'
  if (e.place && e.place.trim().length > EVENT_PLACE_MAX) return `The place must be ${EVENT_PLACE_MAX} characters or fewer`
  if (e.note && e.note.trim().length > EVENT_NOTE_MAX) return `The note must be ${EVENT_NOTE_MAX} characters or fewer`
  return ''
}

/**
 * The next items to show: anything that has not finished by `today` (a
 * multi-day event stays until its last day), soonest first, then by time
 * (no time first), then title.
 */
export function pickUpcoming(items: UpcomingItem[], today: string, limit = UPCOMING_EVENTS_SHOWN): UpcomingItem[] {
  return items
    .filter(i => (i.endDate ?? i.date) >= today)
    .sort((a, b) =>
      a.date.localeCompare(b.date)
      || (a.time ?? '').localeCompare(b.time ?? '')
      || a.title.localeCompare(b.title)
    )
    .slice(0, limit)
}
