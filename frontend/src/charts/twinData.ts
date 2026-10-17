import type { Annotation, Forecast, NsState, QuantilePoint, Timeline, TimelineRow } from '@/api/types'

export interface TwinPoint {
  date: string
  isForecast: boolean
  // measured
  rhr: number | null
  lnrmssd: number | null
  hrv7: number | null
  sbp: number | null
  sbp_slope: number | null
  ns_state: NsState | null
  missing: boolean
  risk_score: number | null
  events: string[]
  // forecast (RHR)
  rhr_p10: number | null
  rhr_fan: number | null
  rhr_p50: number | null
  // forecast (SBP)
  sbp_p10: number | null
  sbp_fan: number | null
  sbp_p50: number | null
  // annotations on this date
  annotations: Annotation[]
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Ordinary least squares slope/intercept over index positions. */
function ols(points: { x: number; y: number }[]): { m: number; b: number } | null {
  if (points.length < 3) return null
  const n = points.length
  const sx = points.reduce((a, p) => a + p.x, 0)
  const sy = points.reduce((a, p) => a + p.y, 0)
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0)
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0)
  const den = n * sxx - sx * sx
  if (den === 0) return null
  const m = (n * sxy - sx * sy) / den
  const b = (sy - m * sx) / n
  return { m, b }
}

/**
 * Merges timeline rows with the 72 h forecast into one array for the three
 * synchronised panels. The last measured day also carries the forecast start
 * so the dashed P50 line and the fan begin exactly at the last measurement.
 */
export function buildTwinData(timeline: Timeline, forecast: Forecast | null): TwinPoint[] {
  const rows = timeline.rows
  const byDate = new Map<string, Annotation[]>()
  for (const a of timeline.annotations) {
    const list = byDate.get(a.date) ?? []
    list.push(a)
    byDate.set(a.date, list)
  }

  // 7-day rolling mean of lnRMSSD
  const hrv7: (number | null)[] = rows.map((_, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1).map((r) => r.lnrmssd).filter((v): v is number => v !== null)
    return win.length >= 3 ? mean(win) : null
  })

  // 7-day SBP slope line across the last 7 rows
  const last7 = rows.slice(-7)
  const slopePts = last7.map((r, i) => ({ x: i, y: r.sbp_home })).filter((p): p is { x: number; y: number } => p.y !== null)
  const fit = ols(slopePts)

  const out: TwinPoint[] = rows.map((r: TimelineRow, i) => {
    const inLast7 = i >= rows.length - 7
    const k = i - (rows.length - 7)
    return {
      date: r.date,
      isForecast: false,
      rhr: r.rhr,
      lnrmssd: r.lnrmssd,
      hrv7: hrv7[i] === null ? null : Math.round(hrv7[i]! * 100) / 100,
      sbp: r.sbp_home,
      sbp_slope: fit && inLast7 ? Math.round((fit.m * k + fit.b) * 10) / 10 : null,
      ns_state: r.missing ? null : r.ns_state,
      missing: r.missing,
      risk_score: r.risk_score,
      events: r.events,
      rhr_p10: null,
      rhr_fan: null,
      rhr_p50: null,
      sbp_p10: null,
      sbp_fan: null,
      sbp_p50: null,
      annotations: byDate.get(r.date) ?? [],
    }
  })

  if (forecast) {
    const lastMeasured = [...out].reverse().find((p) => !p.missing)
    if (lastMeasured) {
      if (lastMeasured.rhr !== null) {
        lastMeasured.rhr_p10 = lastMeasured.rhr
        lastMeasured.rhr_fan = 0
        lastMeasured.rhr_p50 = lastMeasured.rhr
      }
      const lastSbp = [...out].reverse().find((p) => p.sbp !== null)
      if (lastSbp && lastSbp === lastMeasured) {
        lastMeasured.sbp_p10 = lastMeasured.sbp
        lastMeasured.sbp_fan = 0
        lastMeasured.sbp_p50 = lastMeasured.sbp
      }
    }
    const horizon = Math.max(forecast.rhr.length, forecast.sbp.length)
    for (let i = 0; i < horizon; i++) {
      const r: QuantilePoint | undefined = forecast.rhr[i]
      const s: QuantilePoint | undefined = forecast.sbp[i]
      const date = r?.date ?? s?.date
      if (!date) continue
      out.push({
        date,
        isForecast: true,
        rhr: null,
        lnrmssd: null,
        hrv7: null,
        sbp: null,
        sbp_slope: null,
        ns_state: null,
        missing: false,
        risk_score: null,
        events: [],
        rhr_p10: r ? r.p10 : null,
        rhr_fan: r ? Math.round((r.p90 - r.p10) * 10) / 10 : null,
        rhr_p50: r ? r.p50 : null,
        sbp_p10: s ? s.p10 : null,
        sbp_fan: s ? s.p90 - s.p10 : null,
        sbp_p50: s ? s.p50 : null,
        annotations: byDate.get(date) ?? [],
      })
    }
  }
  return out
}

/** Gradient stops across the measured range, one colour per NightSignal state, hard edges. */
export function nsGradientStops(points: TwinPoint[], colours: Record<NsState, string>): { offset: number; color: string }[] {
  const measured = points.filter((p) => !p.isForecast)
  const n = measured.length
  if (n === 0) return []
  const stops: { offset: number; color: string }[] = []
  for (let i = 0; i < n; i++) {
    const color = colours[measured[i].ns_state ?? 'green']
    const prev = i === 0 ? null : colours[measured[i - 1].ns_state ?? 'green']
    const at = n === 1 ? 0 : i / (n - 1)
    if (prev !== null && prev !== color) {
      const mid = (at + (i - 1) / (n - 1)) / 2
      stops.push({ offset: mid, color: prev })
      stops.push({ offset: mid, color })
    } else if (i === 0) {
      stops.push({ offset: 0, color })
    }
    if (i === n - 1) stops.push({ offset: 1, color })
  }
  return stops
}

/** Pads the data extent and snaps it outward to a multiple of `step`. */
export function padDomain(values: (number | null | undefined)[], pad: number, decimals = 0, step?: number): [number, number] {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!xs.length) return [0, 1]
  const lo = Math.min(...xs) - pad
  const hi = Math.max(...xs) + pad
  if (step) return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step]
  const f = 10 ** decimals
  return [Math.floor(lo * f) / f, Math.ceil(hi * f) / f]
}

/** Evenly spaced ticks across a snapped domain. */
export function niceTicks(domain: [number, number], step: number): number[] {
  const out: number[] = []
  const n = Math.round((domain[1] - domain[0]) / step)
  for (let i = 0; i <= n; i++) out.push(Math.round((domain[0] + i * step) * 1000) / 1000)
  return out
}
