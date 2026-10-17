import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface StatProps {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'leaf' | 'turmeric' | 'sindoor' | 'peacock'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const TONE = {
  default: 'text-ink',
  leaf: 'text-leaf',
  turmeric: 'text-turmeric',
  sindoor: 'text-sindoor',
  peacock: 'text-peacock-deep dark:text-peacock',
}

/** A number with its label, unit and a comparison. Numerals are tabular. */
export function Stat({ label, value, unit, hint, tone = 'default', size = 'md', className }: StatProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[12.5px] font-medium text-ink-2">{label}</div>
      <div className={cn('mt-1 flex items-baseline gap-1 tnum tracking-[-0.02em]', TONE[tone])}>
        <span className={cn('font-semibold', size === 'sm' && 'text-[19px] leading-tight', size === 'md' && 'text-[26px] leading-none', size === 'lg' && 'text-[40px] leading-none')}>{value}</span>
        {unit && <span className="text-[13px] font-medium text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[12.5px] leading-5 text-ink-2">{hint}</div>}
    </div>
  )
}
