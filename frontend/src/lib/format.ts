import type { Freshness, NsState, Tier, TierOrOptedOut } from '@/api/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "2026-10-12" to "12 Oct". */
export function fmtDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** "2026-10-12" to "Mon 12 Oct". */
export function fmtDayLong(date: string): string {
  const dt = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  return `${DAYS[dt.getUTCDay()]} ${fmtDay(date)}`
}

/** "2026-10-12" to "Monday 12 October". */
export function fmtDayFull(date: string): string {
  const dt = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  const [, m, d] = date.split('-').map(Number)
  return `${DAYS_LONG[dt.getUTCDay()]} ${d} ${MONTHS_LONG[m - 1]}`
}

/** "2026-10-12" to "12 Oct 2026". */
export function fmtDate(date: string): string {
  const [y] = date.split('-')
  return `${fmtDay(date)} ${y}`
}

/** ISO with offset to "06:40". Reads the clock from the string so the cohort's timezone is kept. */
export function fmtTime(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : iso
}

/** ISO to "12 Oct, 06:40". */
export function fmtDateTime(iso: string): string {
  const date = iso.slice(0, 10)
  return `${fmtDay(date)}, ${fmtTime(iso)}`
}

export function fmtMinutesAgo(min: number): string {
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtPct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`
}

/** Signed number with a real minus sign replaced by a hyphen-minus for plain copy: "+9", "-3.5". */
export function fmtSigned(n: number, digits = 0, unit = ''): string {
  const s = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${s}${Math.abs(n).toFixed(digits)}${unit}`
}

export function fmtSleep(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h} h ${String(m).padStart(2, '0')} m`
}

/** Clinician tier words. */
export const TIER_LABEL: Record<TierOrOptedOut, string> = {
  low: 'Low',
  watch: 'Watch',
  urgent: 'Urgent',
  opted_out: 'Predictions off',
}

/** Patient-facing tier words. */
export const TIER_WORD: Record<TierOrOptedOut, string> = {
  low: 'Steady',
  watch: 'Worth a check-in',
  urgent: 'Needs attention',
  opted_out: 'Predictions off',
}

/** Text colour per tier (leaf, turmeric, sindoor, stone). */
export const TIER_TEXT: Record<TierOrOptedOut, string> = {
  low: 'text-leaf',
  watch: 'text-turmeric',
  urgent: 'text-sindoor',
  opted_out: 'text-stone',
}

/** Stroke colour per tier for SVG (ring, sparkline accents). */
export const TIER_HEX: Record<TierOrOptedOut, string> = {
  low: 'var(--hex-leaf-fill)',
  watch: 'var(--hex-turmeric-fill)',
  urgent: 'var(--hex-sindoor-fill)',
  opted_out: 'var(--hex-stone)',
}

export const NS_TIER: Record<NsState, Tier> = { green: 'low', yellow: 'watch', red: 'urgent' }
export const NS_LABEL: Record<NsState, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

export function tierOfScore(score: number | null): TierOrOptedOut {
  if (score === null) return 'opted_out'
  return score >= 60 ? 'urgent' : score >= 30 ? 'watch' : 'low'
}

/** Data freshness in words: "Synced 47 min ago", "Last synced 9 h ago", "Offline since 10 Oct, 21:00". */
export function freshnessText(f: Freshness): string {
  if (f.label === 'fresh') return `Synced ${fmtMinutesAgo(f.minutes_ago)}`
  if (f.label === 'stale') return `Last synced ${fmtMinutesAgo(f.minutes_ago)}`
  return `Offline since ${fmtDateTime(f.last_sample_at)}`
}

export function sexWord(sex: 'F' | 'M' | 'O'): string {
  return sex === 'F' ? 'Female' : sex === 'M' ? 'Male' : 'Other'
}

export function pronoun(sex: 'F' | 'M' | 'O'): { her: string; she: string } {
  return sex === 'F' ? { her: 'her', she: 'she' } : sex === 'M' ? { her: 'his', she: 'he' } : { her: 'their', she: 'they' }
}

/** Splits strings the backend joins with a middle dot into separate items, so the UI never shows one. */
export function splitMeta(s: string): string[] {
  return s
    .split(/\s*[\u00b7\u2022]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Replaces typographic dashes coming from data with plain words or commas. */
export function plainDashes(s: string): string {
  return s.replace(/\s*\u2014\s*/g, ', ').replace(/(\d)\s*\u2013\s*(\d)/g, '$1 to $2').replace(/\s*\u2013\s*/g, ', ')
}
