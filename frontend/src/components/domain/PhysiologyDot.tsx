import { useEffect, useRef, useState } from 'react'
import type { PhysiologyResponse } from '@/api/types'

/** Fills its container's width (falls back to `width` until measured). */
export function PhysiologyDotFluid({ r, name, height = 34, max = 520 }: { r: PhysiologyResponse; name: string; height?: number; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(280)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, Math.min(max, Math.round(e.contentRect.width)))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [max])
  return (
    <div ref={ref} className="w-full">
      <PhysiologyDot r={r} name={name} width={w} height={height} />
    </div>
  )
}

/**
 * Dot and whisker: this person's response slope with its interval, against the cohort average.
 * Zero is a dashed line, so "the lever does nothing" is visible. Lotus is the person, ink-3 is most people.
 */
export function PhysiologyDot({ r, name, width = 240, height = 34 }: { r: PhysiologyResponse; name: string; width?: number; height?: number }) {
  const lo = Math.min(r.interval[0], r.cohort, 0)
  const hi = Math.max(r.interval[1], r.cohort, 0)
  const span = hi - lo || 1
  const pad = span * 0.12
  const x = (v: number) => 6 + ((v - (lo - pad)) / (span + pad * 2)) * (width - 12)
  const cy = height / 2
  const unit = r.unit === '% HRV' ? '%' : ` ${r.unit}`
  const label = `${name}: ${r.personal.toFixed(2)}${unit} per ${r.per}, interval ${r.interval[0].toFixed(2)} to ${r.interval[1].toFixed(2)}. Most people: ${r.cohort.toFixed(2)}${unit}.`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block max-w-full">
      <line x1={6} x2={width - 6} y1={cy} y2={cy} stroke="var(--hex-mist-deep)" strokeWidth={2} strokeLinecap="round" />
      <line x1={x(0)} x2={x(0)} y1={4} y2={height - 4} stroke="var(--hex-ink-3)" strokeWidth={1} strokeDasharray="2 3" />
      {/* most people */}
      <line x1={x(r.cohort)} x2={x(r.cohort)} y1={cy - 9} y2={cy + 9} stroke="var(--hex-ink-2)" strokeWidth={2} strokeLinecap="round" />
      {/* this person: interval and estimate */}
      <line x1={x(r.interval[0])} x2={x(r.interval[1])} y1={cy} y2={cy} stroke="var(--hex-lotus)" strokeWidth={3} strokeLinecap="round" />
      <line x1={x(r.interval[0])} x2={x(r.interval[0])} y1={cy - 5} y2={cy + 5} stroke="var(--hex-lotus)" strokeWidth={2} strokeLinecap="round" />
      <line x1={x(r.interval[1])} x2={x(r.interval[1])} y1={cy - 5} y2={cy + 5} stroke="var(--hex-lotus)" strokeWidth={2} strokeLinecap="round" />
      <circle cx={x(r.personal)} cy={cy} r={6} fill="var(--hex-lotus)" stroke="var(--hex-surface)" strokeWidth={2} />
    </svg>
  )
}

export const EVIDENCE_WORD = { strong: 'Strong evidence', moderate: 'Moderate evidence', weak: 'Weak evidence' } as const
