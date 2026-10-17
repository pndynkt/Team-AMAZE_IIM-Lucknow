import { useId, useMemo } from 'react'
import { Area, ComposedChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import type { Intraday } from '@/api/types'
import { fmtDayLong, fmtTime } from '@/lib/format'
import { C, axisLine, axisTick, cursorStyle } from './theme'
import { ChartTooltipCard } from './ChartTooltip'
import { niceTicks } from './twinData'

interface Pt {
  m: number
  t: string
  hr: number
}

/** 5-minute heart rate for one day; the overnight window that feeds the twin is shaded. */
export function IntradayChart({ intraday, height = 200 }: { intraday: Intraday; height?: number }) {
  const uid = useId().replace(/:/g, '')
  const data = useMemo<Pt[]>(
    () =>
      intraday.samples.map((s) => {
        const [hh, mm] = fmtTime(s.t).split(':').map(Number)
        return { m: hh * 60 + mm, t: s.t, hr: s.hr }
      }),
    [intraday],
  )
  const [onStart, onEnd] = intraday.overnight_window.map((w) => {
    const [h, m] = w.split(':').map(Number)
    return h * 60 + m
  })
  if (!data.length) return null
  const hrs = data.map((d) => d.hr)
  const rawLo = Math.max(30, Math.min(...hrs, intraday.overnight_rhr) - 6)
  const rawHi = Math.max(...hrs, intraday.overnight_rhr) + 6
  const step = rawHi - rawLo > 40 ? 20 : 10
  const domain: [number, number] = [Math.floor(rawLo / step) * step, Math.ceil(rawHi / step) * step]
  const ticks = [0, 360, 720, 1080, 1440]
  return (
    <div style={{ height }} role="img" aria-label={`Heart rate every 5 minutes on ${fmtDayLong(intraday.date)}. Overnight resting heart rate ${intraday.overnight_rhr} bpm.`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.peacock} stopOpacity={0.22} />
              <stop offset="1" stopColor={C.peacock} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="m" type="number" domain={[0, 1440]} ticks={ticks} tickFormatter={(m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`} tick={axisTick} tickLine={false} axisLine={axisLine} height={22} />
          <YAxis domain={domain} ticks={niceTicks(domain, step)} width={32} tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
          <ReferenceArea x1={onStart} x2={onEnd} fill={C.mistDeep} fillOpacity={0.7} ifOverflow="hidden" label={{ value: 'Overnight', position: 'insideTopLeft', fontSize: 11, fill: C.ink2, offset: 6 }} />
          <ReferenceLine y={intraday.overnight_rhr} stroke={C.ink2} strokeDasharray="3 3" label={{ value: `Resting ${intraday.overnight_rhr}`, position: 'insideBottomRight', fontSize: 11, fill: C.ink2 }} />
          <Area type="monotone" dataKey="hr" stroke={C.ink} strokeWidth={1.5} fill={`url(#${uid}-fill)`} dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: C.ink, stroke: C.surface }} />
          <Tooltip content={<IntradayTooltip />} cursor={cursorStyle} wrapperStyle={{ outline: 'none' }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function IntradayTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as Pt
  return <ChartTooltipCard title={fmtTime(p.t)} rows={[{ label: 'Heart rate', value: `${p.hr} bpm`, swatch: C.ink }]} footer="Simulated 5-minute sample" />
}
