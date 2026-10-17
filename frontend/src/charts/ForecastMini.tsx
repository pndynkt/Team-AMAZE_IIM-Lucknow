import { useId, useMemo } from 'react'
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import type { QuantilePoint } from '@/api/types'
import { fmtDay, fmtDayLong } from '@/lib/format'
import { C, FAN_OPACITY, BAND_OPACITY, axisLine, axisTick, bandLabel as bandLabelFn, cursorStyle } from './theme'
import { ChartTooltipCard, type TooltipRow } from './ChartTooltip'
import { niceTicks } from './twinData'

interface Pt {
  date: string
  measured: number | null
  p10: number | null
  fan: number | null
  p50: number | null
  s_p10: number | null
  s_fan: number | null
  s_p50: number | null
}

export interface ForecastMiniProps {
  history: { date: string; value: number | null }[]
  forecast: QuantilePoint[]
  /** Second fan (Simulate tab). When present the baseline turns grey and the scenario takes peacock. */
  scenario?: QuantilePoint[] | null
  band?: [number, number]
  /** "Her usual range" */
  bandLabel?: string
  unit: string
  height?: number
  decimals?: number
  label: string
}

/** Measured line, dashed forecast and P10 to P90 fan, with the person's usual range as a band. */
export function ForecastMini({ history, forecast, scenario, band, bandLabel = 'Usual range', unit, height = 170, decimals = 0, label }: ForecastMiniProps) {
  const uid = useId().replace(/:/g, '')
  const data = useMemo<Pt[]>(() => {
    const pts: Pt[] = history.map((h) => ({ date: h.date, measured: h.value, p10: null, fan: null, p50: null, s_p10: null, s_fan: null, s_p50: null }))
    const last = [...pts].reverse().find((p) => p.measured !== null)
    if (last && last.measured !== null) {
      last.p10 = last.measured
      last.fan = 0
      last.p50 = last.measured
      if (scenario) {
        last.s_p10 = last.measured
        last.s_fan = 0
        last.s_p50 = last.measured
      }
    }
    forecast.forEach((f, i) => {
      const s = scenario?.[i]
      pts.push({ date: f.date, measured: null, p10: f.p10, fan: f.p90 - f.p10, p50: f.p50, s_p10: s ? s.p10 : null, s_fan: s ? s.p90 - s.p10 : null, s_p50: s ? s.p50 : null })
    })
    return pts
  }, [history, forecast, scenario])
  const vals = data
    .flatMap((d) => [d.measured, d.p10, d.p10 !== null && d.fan !== null ? d.p10 + d.fan : null, d.s_p10, d.s_p10 !== null && d.s_fan !== null ? d.s_p10 + d.s_fan : null, ...(band ?? [])])
    .filter((v): v is number => v !== null)
  const lo = vals.length ? Math.min(...vals) : 0
  const hi = vals.length ? Math.max(...vals) : 1
  const pad = (hi - lo) * 0.15 || 1
  const span = hi - lo + pad * 2
  const step = span <= 12 ? 2 : span <= 30 ? 5 : span <= 60 ? 10 : 20
  const domain: [number, number] = [Math.floor((lo - pad) / step) * step, Math.ceil((hi + pad) / step) * step]
  const today = [...history].reverse().find((h) => h.value !== null)?.date ?? history[history.length - 1]?.date
  const baseColor = scenario ? C.ink3 : C.peacock
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={axisLine} tickFormatter={(d: string) => fmtDay(d)} interval={Math.max(0, Math.floor(data.length / 5))} height={22} padding={{ left: 4, right: 4 }} />
          <YAxis allowDataOverflow domain={domain} ticks={niceTicks(domain, step)} width={34} tick={axisTick} tickLine={false} axisLine={false} allowDecimals={decimals > 0} />
          {band && <ReferenceArea y1={band[0]} y2={band[1]} fill={C.mistDeep} fillOpacity={BAND_OPACITY} ifOverflow="hidden" label={bandLabelFn(bandLabel)} />}
          {today && <ReferenceLine x={today} stroke={C.ink3} strokeDasharray="2 3" />}
          <Area type="monotone" dataKey="p10" stackId={`b-${uid}`} stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
          <Area type="monotone" dataKey="fan" stackId={`b-${uid}`} stroke="none" fill={baseColor} fillOpacity={scenario ? 0.12 : FAN_OPACITY} isAnimationActive={false} activeDot={false} />
          {scenario && (
            <>
              <Area type="monotone" dataKey="s_p10" stackId={`s-${uid}`} stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
              <Area type="monotone" dataKey="s_fan" stackId={`s-${uid}`} stroke="none" fill={C.peacock} fillOpacity={FAN_OPACITY + 0.04} isAnimationActive={false} activeDot={false} />
              <Line type="monotone" dataKey="s_p50" stroke={C.peacock} strokeWidth={2.25} strokeDasharray="5 4" dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: C.peacock, stroke: C.surface }} />
            </>
          )}
          <Line type="monotone" dataKey="p50" stroke={baseColor} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: baseColor, stroke: C.surface }} />
          <Line type="monotone" dataKey="measured" stroke={C.ink} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls activeDot={{ r: 4, fill: C.ink, stroke: C.surface, strokeWidth: 2 }} />
          <Tooltip content={<MiniTooltip unit={unit} decimals={decimals} hasScenario={!!scenario} />} cursor={cursorStyle} wrapperStyle={{ outline: 'none' }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function MiniTooltip({ active, payload, label, unit, decimals, hasScenario }: TooltipProps<number, string> & { unit: string; decimals: number; hasScenario: boolean }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as Pt
  const f = (v: number) => `${v.toFixed(decimals)} ${unit}`
  const rows: TooltipRow[] = []
  if (p.measured !== null) rows.push({ label: 'Measured', value: f(p.measured), swatch: C.ink })
  if (p.p50 !== null && p.measured === null) {
    rows.push({ label: hasScenario ? 'As things are' : 'Forecast', value: f(p.p50), swatch: hasScenario ? C.ink3 : C.peacock, dashed: true })
    rows.push({ label: 'Likely range', value: `${p.p10!.toFixed(decimals)} to ${(p.p10! + p.fan!).toFixed(decimals)}`, swatch: hasScenario ? C.ink3 : C.peacock, band: true })
  }
  if (hasScenario && p.s_p50 !== null && p.measured === null) {
    rows.push({ label: 'With these changes', value: f(p.s_p50), swatch: C.peacock, dashed: true })
    rows.push({ label: 'Likely range', value: `${p.s_p10!.toFixed(decimals)} to ${(p.s_p10! + p.s_fan!).toFixed(decimals)}`, swatch: C.peacock, band: true })
  }
  return <ChartTooltipCard title={fmtDayLong(String(label))} rows={rows} />
}
