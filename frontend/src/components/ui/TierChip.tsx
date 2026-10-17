import { AlertTriangle, CheckCircle2, Eye, MinusCircle } from 'lucide-react'
import type { NsState, TierOrOptedOut } from '@/api/types'
import { NS_LABEL, NS_TIER, TIER_LABEL, TIER_WORD } from '@/lib/format'
import { cn } from '@/lib/cn'

export const TIER_ICON: Record<TierOrOptedOut, typeof CheckCircle2> = {
  low: CheckCircle2,
  watch: Eye,
  urgent: AlertTriangle,
  opted_out: MinusCircle,
}

const TONE: Record<TierOrOptedOut, string> = {
  low: 'bg-leaf-soft text-leaf',
  watch: 'bg-turmeric-soft text-turmeric',
  urgent: 'bg-sindoor-soft text-sindoor',
  opted_out: 'bg-stone-soft text-stone',
}

export interface TierChipProps {
  tier: TierOrOptedOut
  /** Clinician words (Low, Watch, Urgent) or patient words (Steady, Worth a check-in, Needs attention). */
  audience?: 'clinician' | 'patient'
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** Status tier: always an icon and a word, never colour alone. */
export function TierChip({ tier, audience = 'clinician', label, size = 'sm', className }: TierChipProps) {
  const Icon = TIER_ICON[tier]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold',
        size === 'sm' && 'h-6 px-2 text-[12px] [&>svg]:h-3.5 [&>svg]:w-3.5',
        size === 'md' && 'h-7 px-2.5 text-[13px] [&>svg]:h-4 [&>svg]:w-4',
        size === 'lg' && 'h-9 px-3.5 text-[15px] [&>svg]:h-[18px] [&>svg]:w-[18px]',
        TONE[tier],
        className,
      )}
    >
      <Icon strokeWidth={2.1} aria-hidden />
      <span>{label ?? (audience === 'patient' ? TIER_WORD[tier] : TIER_LABEL[tier])}</span>
    </span>
  )
}

/** NightSignal-style rule state in words, with the tier icon. */
export function NsState({ state, nights, className }: { state: NsState; nights?: number; className?: string }) {
  const tier = NS_TIER[state]
  const Icon = TIER_ICON[tier]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-2', className)} title="NightSignal-style overnight heart-rate rule">
      <Icon className={cn('h-3.5 w-3.5', tier === 'low' ? 'text-leaf' : tier === 'watch' ? 'text-turmeric' : 'text-sindoor')} strokeWidth={2.1} aria-hidden />
      <span>
        {NS_LABEL[state]}
        {typeof nights === 'number' && nights > 0 && <span className="text-ink-3">, {nights} {nights === 1 ? 'night' : 'nights'}</span>}
      </span>
    </span>
  )
}
