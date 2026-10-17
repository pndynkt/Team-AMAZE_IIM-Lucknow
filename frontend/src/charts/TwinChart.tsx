import { useId, useMemo, useState, type ReactNode } from 'react'
import { Area, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import { StickyNote, Utensils, X } from 'lucide-react'
import type { Annotation, AnnotationKind, Forecast, Timeline } from '@/api/types'
import { Glyph } from '@/brand'
import { fmtDay, fmtDayLong } from '@/lib/format'
import { cn } from '@/lib/cn'
import { C, FAN_OPACITY, BAND_OPACITY, NS_COLOR, axisLine, axisTick, bandLabel as bandLabelFn, cursorStyle } from './theme'
import { ChartTooltipCard, Swatch, type TooltipRow } from './ChartTooltip'
import { buildTwinData, niceTicks, nsGradientStops, padDomain, type TwinPoint } from './twinData'

const KIND_LABEL: Record<AnnotationKind, string> = { symptom: 'Symptom', meal: 'Meal', missed_dose: 'Missed dose', note: 'Clinician note' }
const KIND_COLOR: Record<AnnotationKind, string> = { symptom: C.lotus, meal: C.ink2, missed_dose: C.sandalwood, note: C.peacock }

function KindIcon({ kind, size = 12 }: { kind: AnnotationKind; size?: number }) {
  if (kind === 'missed_dose') return <Glyph name="medicine" size={size} tone="current" />
  if (kind === 'symptom') return <Glyph name="heart" size={size} tone="current" />
  if (kind === 'meal') return <Utensils width={size} height={size} strokeWidth={2.1} />
  return <StickyNote width={size} height={size} strokeWidth={2.1} />
}

export interface TwinChartProps {
  timeline: Timeline
  forecast: Forecast | null
  asOf: string
  selectedDate: string | null
  onSelectDate: (date: string) => void
  /** "Her usual range" */
  usualLabel: string
  className?: string
}

/**
 * Three synchronised panels (overnight resting heart rate, HRV, home systolic BP) sharing one x axis.
 * Measured values in ink, the person's usual range as a mist band, NightSignal tint under the heart-rate
 * line, the forecast dashed in peacock with its P10 to P90 fan.
 */
export function TwinChart({ timeline, forecast, asOf, selectedDate, onSelectDate, usualLabel, className }: TwinChartProps) {
  const uid = useId().replace(/:/g, '')
  const base = useMemo(() => buildTwinData(timeline, forecast), [timeline, forecast])
  const stops = useMemo(() => nsGradientStops(base, NS_COLOR), [base])
  const [popover, setPopover] = useState<{ x: number; y: number; items: Annotation[]; date: string } | null>(null)

  const n = base.length
  const tickInterval = n > 90 ? 14 : n > 50 ? 7 : 4
  const lastDate = base[n - 1]?.date
  const b = timeline.baseline_band

  const rhrDomain = useMemo(() => padDomain([...base.map((d) => d.rhr), ...base.map((d) => d.rhr_p10), ...base.map((d) => (d.rhr_p10 !== null && d.rhr_fan !== null ? d.rhr_p10 + d.rhr_fan : null)), ...b.rhr], 2, 0, 5), [base, b])
  // The overnight rule state as a slim strip along the bottom of the heart-rate panel, one colour per night.
  const data = useMemo(() => {
    const strip = rhrDomain[0] + (rhrDomain[1] - rhrDomain[0]) * 0.045
    return base.map((d) => ({ ...d, ns_strip: !d.isForecast && d.ns_state ? strip : null }))
  }, [base, rhrDomain])
  const hrvDomain = useMemo(() => padDomain([...base.map((d) => d.lnrmssd), ...b.lnrmssd], 0.08, 2, 0.2), [base, b])
  const sbpDomain = useMemo(() => padDomain([...base.map((d) => d.sbp), ...base.map((d) => d.sbp_p10), ...base.map((d) => (d.sbp_p10 !== null && d.sbp_fan !== null ? d.sbp_p10 + d.sbp_fan : null)), ...b.sbp], 4, 0, 10), [base, b])

  const handleClick = (st: { activeLabel?: string | number } | null) => {
    if (st && st.activeLabel !== undefined) onSelectDate(String(st.activeLabel))
  }

  const xAxis = (hide: boolean) => <XAxis dataKey="date" hide={hide} tick={axisTick} tickLine={false} axisLine={axisLine} interval={tickInterval} tickFormatter={(d: string) => fmtDay(d)} height={hide ? 0 : 24} padding={{ left: 6, right: 6 }} />

  const shared = (
    <>
      {asOf && lastDate && lastDate !== asOf && <ReferenceArea x1={asOf} x2={lastDate} fill={C.peacock} fillOpacity={0.035} ifOverflow="hidden" />}
      {selectedDate && <ReferenceLine x={selectedDate} stroke={C.peacock} strokeWidth={1.5} ifOverflow="hidden" />}
    </>
  )

  const rhrNow = lastMeasured(base, 'rhr')
  const hrvNow = lastMeasured(base, 'hrv7')
  const sbpNow = lastMeasured(base, 'sbp')

  return (
    <div className={cn('relative', className)}>
      <Legend usualLabel={usualLabel} />

      <PanelHeading glyph="heart" label="Overnight resting heart rate" unit="bpm" value={rhrNow} band={b.rhr} usualLabel={usualLabel} />
      <div className="relative" style={{ height: 228 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} syncId="twin" margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={handleClick} style={{ cursor: 'crosshair' }}>
            <defs>
              <linearGradient id={`${uid}-ns`} x1="0" y1="0" x2="1" y2="0">
                {stops.map((s, i) => (
                  <stop key={i} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
            </defs>
            {xAxis(true)}
            <YAxis allowDataOverflow domain={rhrDomain} ticks={niceTicks(rhrDomain, 5)} width={40} tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <ReferenceArea y1={b.rhr[0]} y2={b.rhr[1]} fill={C.mistDeep} fillOpacity={BAND_OPACITY} ifOverflow="hidden" label={bandLabelFn(usualLabel)} />
            {shared}
            <ReferenceLine x={asOf} stroke={C.ink3} strokeDasharray="2 3" label={{ value: 'Today', position: 'insideTopLeft', fontSize: 11, fill: C.ink2, offset: 6 }} ifOverflow="hidden" />
            <Area type="step" dataKey="ns_strip" baseValue={rhrDomain[0]} stroke="none" fill={`url(#${uid}-ns)`} fillOpacity={0.85} isAnimationActive={false} connectNulls={false} activeDot={false} />
            <Area type="monotone" dataKey="rhr_p10" stackId="fan" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
            <Area type="monotone" dataKey="rhr_fan" stackId="fan" stroke="none" fill={C.peacock} fillOpacity={FAN_OPACITY} isAnimationActive={false} activeDot={false} />
            <Line type="monotone" dataKey="rhr_p50" stroke={C.peacock} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: C.peacock, stroke: C.surface }} />
            {/* Nights with no watch data: a faint dotted bridge under the measured line, so a gap reads as "watch off", not a break */}
            <Line type="monotone" dataKey="rhr" stroke={C.ink3} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="1 4" strokeLinecap="round" dot={false} isAnimationActive={false} connectNulls activeDot={false} tooltipType="none" legendType="none" />
            <Line type="monotone" dataKey="rhr" stroke={C.ink} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} activeDot={{ r: 4, fill: C.ink, stroke: C.surface, strokeWidth: 2 }} />
            {data
              .filter((d) => d.annotations.length > 0)
              .map((d) => (
                <ReferenceDot
                  key={d.date}
                  x={d.date}
                  y={rhrDomain[1]}
                  ifOverflow="visible"
                  shape={(p: { cx?: number; cy?: number }) => <AnnotationMarker cx={p.cx ?? 0} cy={(p.cy ?? 0) + 10} items={d.annotations} onOpen={(x, y) => setPopover({ x, y, items: d.annotations, date: d.date })} />}
                />
              ))}
            <Tooltip content={<TwinTooltip panel="rhr" />} cursor={cursorStyle} wrapperStyle={{ outline: 'none', zIndex: 20 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        {popover && <AnnotationPopover x={popover.x} y={popover.y} date={popover.date} items={popover.items} onClose={() => setPopover(null)} />}
      </div>

      <PanelHeading glyph="hrv" label="Heart rate variability, 7-night mean" unit="lnRMSSD" value={hrvNow} band={b.lnrmssd} decimals={2} usualLabel={usualLabel} lowerIsWorse />
      <div style={{ height: 136 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} syncId="twin" margin={{ top: 6, right: 12, left: 0, bottom: 0 }} onClick={handleClick} style={{ cursor: 'crosshair' }}>
            {xAxis(true)}
            <YAxis allowDataOverflow domain={hrvDomain} ticks={niceTicks(hrvDomain, 0.2)} width={40} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(1)} />
            <ReferenceArea y1={b.lnrmssd[0]} y2={b.lnrmssd[1]} fill={C.mistDeep} fillOpacity={BAND_OPACITY} ifOverflow="hidden" />
            {shared}
            <ReferenceLine x={asOf} stroke={C.ink3} strokeDasharray="2 3" ifOverflow="hidden" />
            <Line type="monotone" dataKey="lnrmssd" stroke={C.ink3} strokeOpacity={0.55} strokeWidth={1.25} dot={false} isAnimationActive={false} connectNulls={false} activeDot={{ r: 3, fill: C.ink3, stroke: C.surface }} />
            <Line type="monotone" dataKey="hrv7" stroke={C.ink} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls activeDot={{ r: 4, fill: C.ink, stroke: C.surface, strokeWidth: 2 }} />
            <Tooltip content={<TwinTooltip panel="hrv" />} cursor={cursorStyle} wrapperStyle={{ outline: 'none', zIndex: 20 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <PanelHeading glyph="bp" label="Home systolic blood pressure" unit="mmHg" value={sbpNow} band={b.sbp} usualLabel={usualLabel} />
      <div style={{ height: 192 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} syncId="twin" margin={{ top: 6, right: 12, left: 0, bottom: 0 }} onClick={handleClick} style={{ cursor: 'crosshair' }}>
            {xAxis(false)}
            <YAxis allowDataOverflow domain={sbpDomain} ticks={niceTicks(sbpDomain, 10)} width={40} tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <ReferenceArea y1={b.sbp[0]} y2={b.sbp[1]} fill={C.mistDeep} fillOpacity={BAND_OPACITY} ifOverflow="hidden" />
            {shared}
            <ReferenceLine x={asOf} stroke={C.ink3} strokeDasharray="2 3" ifOverflow="hidden" />
            <Area type="monotone" dataKey="sbp_p10" stackId="fan" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
            <Area type="monotone" dataKey="sbp_fan" stackId="fan" stroke="none" fill={C.peacock} fillOpacity={FAN_OPACITY} isAnimationActive={false} activeDot={false} />
            <Line type="monotone" dataKey="sbp_p50" stroke={C.peacock} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: C.peacock, stroke: C.surface }} />
            <Line type="linear" dataKey="sbp_slope" stroke={C.ink2} strokeWidth={1.25} strokeDasharray="1 3" dot={false} isAnimationActive={false} activeDot={false} />
            <Line type="monotone" dataKey="sbp" stroke={C.ink} strokeWidth={1.5} connectNulls dot={{ r: 2.5, fill: C.ink, stroke: C.surface, strokeWidth: 1 }} isAnimationActive={false} activeDot={{ r: 4, fill: C.ink, stroke: C.surface, strokeWidth: 2 }} />
            <Tooltip content={<TwinTooltip panel="sbp" />} cursor={cursorStyle} wrapperStyle={{ outline: 'none', zIndex: 20 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        {timeline.days} days of overnight resting heart rate, heart rate variability and home systolic blood pressure, with a 72 hour forecast. Latest resting heart rate {rhrNow ?? 'not measured'} bpm against {usualLabel.toLowerCase()} of {b.rhr[0]} to {b.rhr[1]}.
      </p>
    </div>
  )
}

function lastMeasured(data: TwinPoint[], key: 'rhr' | 'hrv7' | 'sbp'): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i][key]
    if (v !== null && !data[i].isForecast) return v
  }
  return null
}

function PanelHeading({ glyph, label, unit, value, band, decimals = 0, usualLabel, lowerIsWorse }: { glyph: 'heart' | 'hrv' | 'bp'; label: string; unit: string; value: number | null; band: [number, number]; decimals?: number; usualLabel: string; lowerIsWorse?: boolean }) {
  const inBand = value !== null && value >= band[0] && value <= band[1]
  const above = value !== null && value > band[1]
  const worse = value !== null && !inBand && (lowerIsWorse ? !above : above)
  const gap = value === null ? 0 : above ? value - band[1] : band[0] - value
  const where = inBand ? `within ${usualLabel.toLowerCase()}` : `${gap.toFixed(decimals)} ${above ? 'above' : 'below'} ${usualLabel.toLowerCase()}`
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 first:mt-0">
      <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink">
        <Glyph name={glyph} size={16} tone="identity" />
        {label}
      </span>
      {value !== null && (
        <span className="tnum text-[13.5px] text-ink-2">
          <span className="font-semibold text-ink">{value.toFixed(decimals)}</span> {unit}
          <span className={cn('ml-2', worse ? 'font-medium text-sindoor' : inBand ? 'text-ink-2' : 'text-ink-2')}>
            {where}, {band[0]} to {band[1]}
          </span>
        </span>
      )}
    </div>
  )
}

function Legend({ usualLabel }: { usualLabel: string }) {
  const items: { label: string; swatch: ReactNode }[] = [
    { label: 'Measured', swatch: <Swatch color={C.ink} /> },
    { label: 'Forecast', swatch: <Swatch color={C.peacock} dashed /> },
    { label: 'No data that night', swatch: <span className="inline-block w-3.5 border-t-2 border-dotted" style={{ borderColor: C.ink3 }} /> },
    { label: 'Likely range', swatch: <Swatch color={C.peacock} band /> },
    { label: usualLabel, swatch: <span className="inline-block h-2.5 w-3.5 rounded-[3px] bg-mist-deep" /> },
    {
      label: 'Overnight rule, green, yellow, red',
      swatch: (
        <span className="inline-flex gap-0.5">
          {(['green', 'yellow', 'red'] as const).map((k) => (
            <span key={k} className="inline-block h-1.5 w-2.5 rounded-[2px]" style={{ background: NS_COLOR[k], opacity: 0.85 }} />
          ))}
        </span>
      ),
    },
  ]
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12.5px] text-ink-2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          {it.swatch}
          {it.label}
        </li>
      ))}
    </ul>
  )
}

function AnnotationMarker({ cx, cy, items, onOpen }: { cx: number; cy: number; items: Annotation[]; onOpen: (x: number, y: number) => void }) {
  const kind = items[0].kind
  const color = KIND_COLOR[kind]
  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      style={{ cursor: 'pointer', color }}
      role="button"
      tabIndex={0}
      aria-label={`${items.length} ${items.length > 1 ? 'notes' : 'note'}: ${items.map((i) => i.label).join('; ')}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(cx, cy)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(cx, cy)
        }
      }}
    >
      <circle r={10.5} fill={C.surface} stroke={color} strokeWidth={1.5} />
      <g transform="translate(-6,-6)">
        <KindIcon kind={kind} size={12} />
      </g>
      {items.length > 1 && (
        <g transform="translate(8,-8)">
          <circle r={5.5} fill={color} />
          <text textAnchor="middle" dy="3" fontSize="8" fill="#fff" fontWeight={700}>
            {items.length}
          </text>
        </g>
      )}
    </g>
  )
}

function AnnotationPopover({ x, y, date, items, onClose }: { x: number; y: number; date: string; items: Annotation[]; onClose: () => void }) {
  const flip = x > 420
  return (
    <div role="dialog" aria-label={`Notes on ${fmtDayLong(date)}`} className="absolute z-30 w-64 rounded-block border border-line bg-surface p-3.5 text-[13px] shadow-lift" style={{ left: flip ? undefined : x + 16, right: flip ? `calc(100% - ${x - 16}px)` : undefined, top: Math.max(0, y - 8) }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">{fmtDayLong(date)}</span>
        <button type="button" onClick={onClose} className="rounded-[8px] p-1 text-ink-2 hover:bg-ink/[0.06] hover:text-ink" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="space-y-2.5">
        {items.map((a, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2" style={{ color: KIND_COLOR[a.kind] }}>
              <KindIcon kind={a.kind} size={13} />
            </span>
            <div className="min-w-0">
              <p className="font-medium leading-5">{a.label}</p>
              <p className="text-[12px] text-ink-2">
                {KIND_LABEL[a.kind]}, by {a.by === 'patient' ? 'the person' : a.by}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TwinTooltip({ active, payload, label, panel }: TooltipProps<number, string> & { panel: 'rhr' | 'hrv' | 'sbp' }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as TwinPoint | undefined
  if (!p) return null
  const rows: TooltipRow[] = []
  if (panel === 'rhr') {
    if (p.rhr !== null) rows.push({ label: 'Measured', value: `${p.rhr.toFixed(1)} bpm`, swatch: C.ink })
    if (p.isForecast && p.rhr_p50 !== null) {
      rows.push({ label: 'Forecast', value: `${p.rhr_p50.toFixed(1)} bpm`, swatch: C.peacock, dashed: true })
      rows.push({ label: 'Likely range', value: `${p.rhr_p10!.toFixed(1)} to ${(p.rhr_p10! + p.rhr_fan!).toFixed(1)}`, swatch: C.peacock, band: true })
    }
    if (p.ns_state) rows.push({ label: 'Rule state', value: p.ns_state.charAt(0).toUpperCase() + p.ns_state.slice(1), swatch: NS_COLOR[p.ns_state], band: true })
    if (p.risk_score !== null) rows.push({ label: 'Risk score', value: p.risk_score })
  } else if (panel === 'hrv') {
    if (p.lnrmssd !== null) rows.push({ label: 'That night', value: p.lnrmssd.toFixed(2), swatch: C.ink3 })
    if (p.hrv7 !== null) rows.push({ label: '7-night mean', value: p.hrv7.toFixed(2), swatch: C.ink })
  } else {
    if (p.sbp !== null) rows.push({ label: 'Home reading', value: `${p.sbp} mmHg`, swatch: C.ink })
    if (p.sbp_slope !== null) rows.push({ label: '7-day trend', value: `${p.sbp_slope.toFixed(1)} mmHg`, swatch: C.ink2, dashed: true })
    if (p.isForecast && p.sbp_p50 !== null) {
      rows.push({ label: 'Forecast', value: `${p.sbp_p50} mmHg`, swatch: C.peacock, dashed: true })
      rows.push({ label: 'Likely range', value: `${p.sbp_p10} to ${p.sbp_p10! + p.sbp_fan!}`, swatch: C.peacock, band: true })
    }
  }
  if (p.missing) rows.push({ label: 'Watch', value: 'not worn' })
  const footer = p.annotations.length ? p.annotations.map((a) => a.label).join('; ') : p.isForecast ? 'Forecast day' : undefined
  return <ChartTooltipCard title={fmtDayLong(String(label))} rows={rows} footer={footer} />
}
