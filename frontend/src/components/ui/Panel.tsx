import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  /** Leading mark beside the title (a glyph or a stream tag). */
  lead?: ReactNode
  padded?: boolean
  as?: 'div' | 'section' | 'article'
  /** `quiet` drops the shadow and the fill, for secondary blocks that sit on the mist ground. */
  tone?: 'default' | 'quiet'
}

/** A page panel (22 px radius, resting shadow). Use one strong panel per screen; keep the rest quiet. */
export function Panel({ title, subtitle, action, lead, padded = true, className, children, as = 'section', tone = 'default', ...rest }: PanelProps) {
  const Tag = as
  return (
    <Tag className={cn(tone === 'default' ? 'panel' : 'rounded-panel border border-line', padded && 'p-5 md:p-6', className)} {...rest}>
      {(title || action) && (
        <header className={cn('flex items-start justify-between gap-4', padded ? 'mb-4' : 'px-5 pt-5 md:px-6 md:pt-6 mb-3')}>
          <div className="flex min-w-0 items-start gap-2.5">
            {lead && <span className="mt-0.5 shrink-0">{lead}</span>}
            <div className="min-w-0">
              {title && <h2 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </Tag>
  )
}

/** Section heading used inside a panel or on the mist ground. */
export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <h3 className="text-[14px] font-semibold text-ink">{children}</h3>
      {aside && <div className="text-[12.5px] text-ink-2">{aside}</div>}
    </div>
  )
}
