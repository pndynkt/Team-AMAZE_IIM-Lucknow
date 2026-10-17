export interface SparklineProps {
  /** Daily values, oldest first. Nulls leave a gap. */
  values: (number | null)[]
  width?: number
  height?: number
  color?: string
  /** Draws a soft band between these two values (the person's usual range). */
  band?: [number, number]
  label?: string
  className?: string
}

/** Tiny inline line for list rows. Gaps where a night is missing; the last value is a dot. */
export function Sparkline({ values, width = 72, height = 24, color = 'var(--hex-ink)', band, label, className }: SparklineProps) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => typeof p.v === 'number' && Number.isFinite(p.v))
  if (pts.length < 2) return <span className="text-caption text-ink-3">Not enough data</span>
  const lo = Math.min(...pts.map((p) => p.v), ...(band ?? []))
  const hi = Math.max(...pts.map((p) => p.v), ...(band ?? []))
  const pad = 3
  const span = hi - lo || 1
  const n = values.length
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (width - pad * 2)
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2)
  // break the line where a value is missing
  let d = ''
  let prev = -2
  for (const p of pts) {
    d += `${p.i === prev + 1 ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)} `
    prev = p.i
  }
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={label ?? `Trend from ${pts[0].v} to ${last.v}`}>
      {band && <rect x={0} y={y(band[1])} width={width} height={Math.max(1, y(band[0]) - y(band[1]))} rx={2} fill="var(--hex-mist-deep)" opacity={0.8} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.4} fill={color} />
    </svg>
  )
}
