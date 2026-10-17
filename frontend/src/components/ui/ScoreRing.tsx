import { useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { TIER_HEX } from '@/lib/format'
import type { TierOrOptedOut } from '@/api/types'

export interface ScoreRingProps {
  /** 0 to 100, or null when predictions are off. */
  value: number | null
  tier: TierOrOptedOut
  /** Fill fraction override (the calibrating ring fills by nights collected). */
  progress?: number
  size?: number
  stroke?: number
  /** Content in the middle; defaults to the value. */
  children?: ReactNode
  className?: string
  label: string
}

/** The patient's ring: a 270 degree arc that fills once (the patient view's one motion moment). */
export function ScoreRing({ value, tier, progress, size = 200, stroke = 14, children, className, label }: ScoreRingProps) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const arc = c * 0.75
  const frac = progress ?? (value === null ? 0 : Math.max(0, Math.min(100, value)) / 100)
  const target = frac * arc
  const [offset, setOffset] = useState(reduce ? arc - target : arc)
  useEffect(() => {
    if (reduce) {
      setOffset(arc - target)
      return
    }
    const raf = requestAnimationFrame(() => setOffset(arc - target))
    return () => cancelAnimationFrame(raf)
  }, [arc, target, reduce])
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-[225deg]" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hex-mist-deep)" strokeWidth={stroke} strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TIER_HEX[tier]}
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${c}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: reduce ? 'none' : 'stroke-dashoffset 1200ms cubic-bezier(0.22, 1, 0.36, 1) 150ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children ?? <span className="tnum text-[48px] font-semibold leading-none tracking-[-0.04em]">{value ?? '--'}</span>}
      </div>
    </div>
  )
}
