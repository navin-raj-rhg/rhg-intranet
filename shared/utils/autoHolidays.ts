import Holidays from 'date-holidays'

/**
 * Malaysian and Australian national public holidays for one year, used to fill the
 * Leave public holidays list automatically. Pure: no database. Only nationwide days
 * are included (no state days). Where both countries share a date the names are
 * merged, e.g. "New Year's Day (MY, AU)".
 */
export interface AutoHoliday {
  date: string
  name: string
}

/** The package gives Malaysian names in Malay; the intranet shows English. */
const MALAY_TO_ENGLISH: Record<string, string> = {
  'Hari Tahun Baru': 'New Year\'s Day',
  'Tahun Baru Cina': 'Chinese New Year',
  'Hari Nuzul Al-Quran': 'Nuzul Al-Quran',
  'Hari Raya Aidil Fitri': 'Hari Raya Aidilfitri',
  'Hari Pekerja': 'Labour Day',
  'Hari Raya Haji': 'Hari Raya Haji',
  'Vesak Day': 'Wesak Day',
  'Hari Keputeraan Yang di-Pertuan Agong': 'Agong\'s Birthday',
  'Awal Muharram': 'Awal Muharram',
  'Hari Keputeraan Nabi Muhammad S.A.W.': 'Maulidur Rasul',
  'Hari Kebangsaan': 'Merdeka Day',
  'Hari Malaysia': 'Malaysia Day',
  'Deepavali': 'Deepavali',
  'Hari Krismas': 'Christmas Day'
}

/** Day 2 of a two-day holiday, substitute days etc. keep a readable suffix. */
function englishName(raw: string): string {
  const substitute = raw.match(/^(.*?)\s*\(substitute day\)$/i)
  if (substitute) return `${englishName(substitute[1]!)} (replacement day)`
  return MALAY_TO_ENGLISH[raw] ?? raw
}

function nationalHolidays(country: 'MY' | 'AU', year: number): AutoHoliday[] {
  return new Holidays(country)
    .getHolidays(year)
    .filter(h => h.type === 'public')
    .map(h => ({ date: h.date.slice(0, 10), name: englishName(h.name) }))
}

export function autoHolidaysForYear(year: number): AutoHoliday[] {
  const byDate = new Map<string, { my: string[], au: string[] }>()
  const add = (list: AutoHoliday[], key: 'my' | 'au') => {
    for (const h of list) {
      const entry = byDate.get(h.date) ?? { my: [], au: [] }
      if (!entry[key].includes(h.name)) entry[key].push(h.name)
      byDate.set(h.date, entry)
    }
  }
  add(nationalHolidays('MY', year), 'my')
  add(nationalHolidays('AU', year), 'au')

  return [...byDate]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, { my, au }]) => {
      const sameName = my.length === 1 && au.length === 1 && my[0] === au[0]
      let name: string
      if (my.length && au.length) {
        name = sameName ? `${my[0]} (MY, AU)` : `${my.join(' / ')} (MY) / ${au.join(' / ')} (AU)`
      } else {
        name = `${(my.length ? my : au).join(' / ')} (${my.length ? 'MY' : 'AU'})`
      }
      return { date, name }
    })
}
