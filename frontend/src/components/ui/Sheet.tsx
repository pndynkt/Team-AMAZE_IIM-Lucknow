import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  /** `side` slides in from the right (console drawer); `bottom` is the mobile bottom sheet. */
  side?: 'right' | 'bottom'
  width?: number
  children: ReactNode
  /** Constrain the bottom sheet to a parent phone frame on desktop. */
  container?: HTMLElement | null
}

export function Sheet({ open, onClose, title, description, side = 'right', width = 480, children, container }: SheetProps) {
  const reduce = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevFocus = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]')?.focus(), 30)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      prevFocus?.focus?.()
    }
  }, [open, onClose])

  const node = (
    <AnimatePresence>
      {open && (
        <div className={cn(container ? 'absolute' : 'fixed', 'inset-0 z-[80] flex', side === 'right' ? 'justify-end' : 'items-end justify-center')}>
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-[rgb(16_48_47/0.32)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={cn(
              'relative flex max-h-full flex-col bg-surface shadow-lift',
              side === 'right' ? 'h-full w-full rounded-l-panel' : 'w-full rounded-t-panel',
            )}
            style={side === 'right' ? { maxWidth: width } : { maxHeight: '88%' }}
            initial={reduce ? { opacity: 0 } : side === 'right' ? { x: 40, opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : side === 'right' ? { x: 40, opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {side === 'bottom' && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-mist-deep" aria-hidden />}
            <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
              <div className="min-w-0">
                {title && <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>}
                {description && <p className="mt-1 text-[13.5px] leading-5 text-ink-2">{description}</p>}
              </div>
              <button type="button" onClick={onClose} className="rounded-control p-1.5 text-ink-2 hover:bg-ink/[0.06] hover:text-ink" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
  return createPortal(node, container ?? document.body)
}
