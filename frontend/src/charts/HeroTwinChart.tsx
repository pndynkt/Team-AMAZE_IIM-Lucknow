import { useId, useMemo } from 'react'
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import type { Forecast, Timeline } from '@/api/types'
import { fmtDay, fmtDayLong } from '@/lib/format'
import { C, FAN_OPACITY, BAND_OPACITY, axisLine, axisTick, bandLabel, cursorStyle } from './theme'
import { ChartTooltipCard, type TooltipRow } from './ChartTooltip'
import { buildTwinData, niceTicks, padDomain, type TwinPoint } from './twinData'

/**
 * Landing hero: Meera's real twin chart (overnight resting heart rate), measured then forecast.
 * The fan opens once after the mark assembles (CSS `fan-open`, off under reduced motion).
 */
export function HeroTwinChart({ timeline, forecast, height = 280 }: { timeline: Timeline; forecast: Forecast; height?: number }) {
  const uid = useId().replace(/:/g, '')
  const data = useMemo(() => buildTwinData(timeline, forecast), [timeline, forecast])
  const band = timeline.baseline_band.rhr
  const domain = useMemo(
    () => padDomain([...data.map((d) => d.rhr), ...data.map((d) => d.rhr_p10), ...data.map((d) => (d.rhr_p10 !== null && d.rhr_fan !== null ? d.rhr_p10 + d.rhr_fan : null)), ...band], 2, 0, 5),
    [data, band],
  )
  const asOf = forecast.as_of
  const last = forecast.rhr[forecast.rhr.length - 1]
  return (
    <div style={{ height }} role="img" aria-label={`Thirty days of Meera's overnight resting heart rate against her usual range of ${band[0]} to ${band[1]} bpm, with a three-day forecast that reaches about ${last?.p50.toFixed(0)} bpm.`}>
      <style>{`
        .fan-open-${uid} { transform-box: fill-box; transform-origin: 0% 50%; animation: fanOpen${uid} 1100ms cubic-bezier(0.22, 1, 0.36, 1) 1500ms both; }
        @keyframes fanOpen${uid} { from { transform: scale(0.02, 0.2); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={axisLine} interval={6} tickFormatter={(d: string) => fmtDay(d)} height={24} padding={{ left: 6, right: 6 }} />
          <YAxis allowDataOverflow domain={domain} ticks={niceTicks(domain, 5)} width={34} tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
          <ReferenceArea y1={band[0]} y2={band[1]} fill={C.mistDeep} fillOpacity={BAND_OPACITY} ifOverflow="hidden" label={bandLabel('Her usual range')} />
          <ReferenceLine x={asOf} stroke={C.ink3} strokeDasharray="2 3" label={{ value: 'Today', position: 'insideTopRight', fontSize: 11.5, fill: C.ink2, offset: 6 }} />
          <Area type="monotone" dataKey="rhr_p10" stackId="fan" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
          <Area type="monotone" dataKey="rhr_fan" stackId="fan" stroke="none" fill={C.peacock} fillOpacity={FAN_OPACITY + 0.04} isAnimationActive={false} activeDot={false} className={`fan-open-${uid}`} />
          <Line type="monotone" dataKey="rhr_p50" stroke={C.peacock} strokeWidth={2.25} strokeDasharray="6 4" dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: C.peacock, stroke: C.surface }} className={`fan-open-${uid}`} />
          <Line type="monotone" dataKey="rhr" stroke={C.ink3} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="1 4" strokeLinecap="round" dot={false} isAnimationActive={false} connectNulls activeDot={false} tooltipType="none" legendType="none" />
          <Line type="monotone" dataKey="rhr" stroke={C.ink} strokeWidth={2.25} dot={false} isAnimationActive={false} connectNulls={false} activeDot={{ r: 4, fill: C.ink, stroke: C.surface, strokeWidth: 2 }} />
          <Tooltip content={<HeroTooltip />} cursor={cursorStyle} wrapperStyle={{ outline: 'none' }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function HeroTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as TwinPoint
  const rows: TooltipRow[] = []
  if (p.rhr !== null) rows.push({ label: 'Overnight heart rate', value: `${p.rhr.toFixed(1)} bpm`, swatch: C.ink })
  if (p.isForecast && p.rhr_p50 !== null) {
    rows.push({ label: 'Forecast', value: `${p.rhr_p50.toFixed(1)} bpm`, swatch: C.peacock, dashed: true })
    rows.push({ label: 'Likely range', value: `${p.rhr_p10!.toFixed(1)} to ${(p.rhr_p10! + p.rhr_fan!).toFixed(1)}`, swatch: C.peacock, band: true })
  }
  return <ChartTooltipCard title={fmtDayLong(String(label))} rows={rows} />
}
