import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ChipTone = 'neutral' | 'peacock' | 'sandalwood' | 'lotus' | 'leaf' | 'turmeric' | 'sindoor' | 'stone' | 'outline'

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-ink/[0.055] text-ink-2',
  peacock: 'bg-peacock-soft text-peacock-deep dark:text-peacock',
  sandalwood: 'bg-sandalwood-soft text-sandalwood-text',
  lotus: 'bg-lotus-soft text-lotus-text',
  leaf: 'bg-leaf-soft text-leaf',
  turmeric: 'bg-turmeric-soft text-turmeric',
  sindoor: 'bg-sindoor-soft text-sindoor',
  stone: 'bg-stone-soft text-stone',
  outline: 'border border-line-strong text-ink-2',
}

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone
  icon?: ReactNode
  size?: 'sm' | 'md'
}

/** Small rounded label. Chips are full radius; the tone carries meaning, never decoration. */
export function Chip({ tone = 'neutral', icon, size = 'sm', className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium align-middle',
        size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-2.5 text-[13px]',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon && <span className="inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      {children}
    </span>
  )
}

/** Marks anything from the synthetic generator. Sentence case, quiet, never shouted. */
export function SimulatedTag({ className, label = 'Simulated' }: { className?: string; label?: string }) {
  return (
    <span
      className={cn('inline-flex h-5 items-center rounded-full border border-dashed border-line-strong px-2 text-[11.5px] font-medium text-ink-2', className)}
      title="Synthetic data from the cohort generator"
    >
      {label}
    </span>
  )
}
