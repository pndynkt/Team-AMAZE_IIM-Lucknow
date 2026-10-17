import { Bar, BarChart, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import type { CalibrationBin, ModelFeature } from '@/api/types'
import { fmtNum } from '@/lib/format'
import { C, axisLine, axisTick } from './theme'
import { ChartTooltipCard } from './ChartTooltip'

/** Reliability diagram: predicted probability against the observed rate, with the diagonal. */
export function CalibrationChart({ bins, height = 260 }: { bins: CalibrationBin[]; height?: number }) {
  const data = bins.map((b) => ({ ...b, diag: b.p_mean }))
  const maxN = Math.max(...bins.map((b) => b.n))
  const top = Math.min(1, Math.ceil(Math.max(0.2, ...bins.map((b) => Math.max(b.p_mean, b.obs))) * 5) / 5)
  const ticks = Array.from({ length: Math.round(top / 0.2) + 1 }, (_, i) => Math.round(i * 0.2 * 100) / 100)
  return (
    <div style={{ height }} role="img" aria-label={`Calibration across ${bins.length} bins. Predicted risk and observed rate stay close to the diagonal.`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
          <XAxis dataKey="p_mean" type="number" domain={[0, top]} ticks={ticks} tick={axisTick} tickLine={false} axisLine={axisLine} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} height={24} />
          <YAxis dataKey="obs" type="number" domain={[0, top]} ticks={ticks} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={40} />
          <Line dataKey="diag" stroke={C.ink3} strokeDasharray="4 4" dot={false} isAnimationActive={false} activeDot={false} legendType="none" />
          <Line dataKey="obs" stroke={C.peacock} strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={false} legendType="none" />
          <Scatter
            dataKey="obs"
            fill={C.peacock}
            isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number; payload?: CalibrationBin }) => <circle cx={p.cx} cy={p.cy} r={4 + Math.sqrt((p.payload?.n ?? 0) / maxN) * 7} fill={C.peacock} fillOpacity={0.85} stroke={C.surface} strokeWidth={1.5} />}
          />
          <Tooltip content={<CalTooltip />} cursor={false} wrapperStyle={{ outline: 'none' }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function CalTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload as CalibrationBin
  return (
    <ChartTooltipCard
      title={`Predicted about ${Math.round(b.p_mean * 100)}%`}
      rows={[
        { label: 'Observed', value: `${(b.obs * 100).toFixed(1)}%`, swatch: C.peacock },
        { label: 'Patient-days', value: fmtNum(b.n) },
      ]}
    />
  )
}

/** Horizontal importance bars coloured by stream: wearable peacock, health record sandalwood. */
export function FeatureImportanceChart({ features, height }: { features: ModelFeature[]; height?: number }) {
  const data = [...features].sort((a, b) => b.importance - a.importance)
  const h = height ?? Math.max(180, data.length * 30 + 16)
  const max = Math.max(...data.map((d) => d.importance))
  return (
    <div style={{ height: h }} role="img" aria-label={`Importance of the top ${data.length} features. The largest is ${data[0]?.label ?? data[0]?.name}.`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 44, left: 4, bottom: 2 }} barCategoryGap={7}>
          <XAxis type="number" domain={[0, max * 1.08]} hide />
          <YAxis type="category" dataKey="name" width={262} tick={{ ...axisTick, fontSize: 12.5, fill: C.ink2 }} tickLine={false} axisLine={false} interval={0} tickFormatter={(n: string) => data.find((d) => d.name === n)?.label ?? n} />
          <Bar dataKey="importance" radius={[0, 5, 5, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 11.5, fill: C.ink2, formatter: (v: number) => (max < 1 ? v.toFixed(2) : fmtNum(v)) }}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.group === 'wearable' ? C.wearable : C.ehr} />
            ))}
          </Bar>
          <Tooltip content={<FeatTooltip />} cursor={{ fill: 'var(--line)' }} wrapperStyle={{ outline: 'none' }} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function FeatTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const f = payload[0].payload as ModelFeature
  return (
    <ChartTooltipCard
      title={f.label ?? f.name}
      rows={[
        { label: 'Importance', value: f.importance < 1 ? f.importance.toFixed(3) : fmtNum(f.importance), swatch: f.group === 'wearable' ? C.wearable : C.ehr, band: true },
        { label: 'Stream', value: f.group === 'wearable' ? 'Wearable' : 'Health record' },
      ]}
      footer={f.name}
    />
  )
}
