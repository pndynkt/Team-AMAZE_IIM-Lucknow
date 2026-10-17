import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface CountdownRingProps {
  /** 0 to 1, how much of the ring is filled. */
  progress: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
  className?: string
  /** Animate the dashoffset between ticks (set false when driving at 60 fps). */
  smooth?: boolean
}

/** Smooth SVG ring used by the SOS hold and the full-screen countdown. */
export function CountdownRing({ progress, size = 220, stroke = 10, color = 'var(--hex-sindoor-fill)', track = 'var(--hex-mist-deep)', children, className, smooth = true }: CountdownRingProps) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: smooth ? 'stroke-dashoffset 120ms linear' : 'none' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}
