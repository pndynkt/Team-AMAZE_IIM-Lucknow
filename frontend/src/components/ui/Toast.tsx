import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastOptions {
  title: string
  description?: string
  kind?: ToastKind
  /** Retry handler; renders a "Try again" button. */
  retry?: () => void | Promise<void>
  durationMs?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastApi {
  toast: (o: ToastOptions) => void
  error: (title: string, retry?: () => void | Promise<void>, description?: string) => void
  success: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const toast = useCallback((o: ToastOptions) => {
    const id = ++counter.current
    setItems((xs) => [...xs.slice(-3), { ...o, id }])
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      error: (title, retry, description) => toast({ title, description, retry, kind: 'error', durationMs: retry ? 12000 : 7000 }),
      success: (title, description) => toast({ title, description, kind: 'success' }),
      info: (title, description) => toast({ title, description, kind: 'info' }),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto w-full max-w-sm"
          >
            <ToastCard item={t} onClose={() => dismiss(t.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const kind = item.kind ?? 'info'
  useEffect(() => {
    const t = window.setTimeout(onClose, item.durationMs ?? 5000)
    return () => window.clearTimeout(t)
  }, [item.durationMs, onClose])
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="flex items-start gap-3 rounded-block border border-line bg-surface p-3.5 pr-2 text-ink shadow-lift">
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', kind === 'error' && 'text-sindoor', kind === 'success' && 'text-leaf', kind === 'info' && 'text-peacock')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-5">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{item.description}</p>}
        {item.retry && (
          <button
            type="button"
            onClick={() => {
              void item.retry?.()
              onClose()
            }}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-peacock-deep px-3 text-[13px] font-medium text-on-peacock hover:bg-peacock-deep/90"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
          </button>
        )}
      </div>
      <button type="button" onClick={onClose} className="rounded-[10px] p-1.5 text-ink-2 hover:bg-ink/[0.06] hover:text-ink" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
