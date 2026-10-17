import { useId, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

export interface TabItem<K extends string = string> {
  key: K
  label: ReactNode
  badge?: ReactNode
}

export interface TabsProps<K extends string> {
  items: TabItem<K>[]
  value: K
  onChange: (k: K) => void
  variant?: 'underline' | 'segmented'
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

/** Underline tabs for page sections, or a segmented control for small option groups. */
export function Tabs<K extends string>({ items, value, onChange, variant = 'underline', size = 'md', className, ...rest }: TabsProps<K>) {
  const id = useId()
  const reduce = useReducedMotion()
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    onChange(items[next].key)
    ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
  }
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 520, damping: 42 }

  if (variant === 'segmented') {
    return (
      <div role="tablist" aria-label={rest['aria-label']} className={cn('inline-flex items-center rounded-control bg-ink/[0.055] p-[3px]', className)}>
        {items.map((it, idx) => {
          const active = it.key === value
          return (
            <button
              key={it.key}
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onKeyDown={(e) => onKey(e, idx)}
              onClick={() => onChange(it.key)}
              className={cn(
                'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] font-medium transition-colors',
                size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-[13.5px]',
                active ? 'text-ink' : 'text-ink-2 hover:text-ink',
              )}
            >
              {active && <motion.span layoutId={`${id}-seg`} className="absolute inset-0 rounded-[9px] bg-surface shadow-[0_1px_2px_rgba(16,48,47,0.1)]" transition={spring} />}
              <span className="relative inline-flex items-center gap-1.5">
                {it.label}
                {it.badge}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div role="tablist" aria-label={rest['aria-label']} className={cn('flex items-center gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((it, idx) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, idx)}
            onClick={() => onChange(it.key)}
            className={cn('relative -mb-px flex h-11 shrink-0 items-center gap-2 px-3 text-[14.5px] font-medium transition-colors', active ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {it.label}
            {it.badge}
            {active && <motion.span layoutId={`${id}-underline`} className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-peacock" transition={spring} />}
          </button>
        )
      })}
    </div>
  )
}
