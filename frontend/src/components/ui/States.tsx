import type { ReactNode } from 'react'
import { AlertCircle, Clock3, RotateCcw, WifiOff } from 'lucide-react'
import { isNotAvailable } from '@/api/client'
import { Button } from './Button'
import { cn } from '@/lib/cn'

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start rounded-block bg-surface-2 px-5 py-6', className)}>
      {icon && <div className="mb-2 text-ink-3 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>}
      <p className="text-[14.5px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-prose text-[13.5px] leading-5 text-ink-2">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'This did not load', body, onRetry, className }: { title?: string; body?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-start rounded-block bg-sindoor-soft/70 px-5 py-5', className)}>
      <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
        <AlertCircle className="h-4 w-4 text-sindoor" aria-hidden />
        {title}
      </p>
      {body && <p className="mt-1 max-w-prose text-[13.5px] leading-5 text-ink-2">{body}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" icon={<RotateCcw />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** For v1.1 endpoints that the backend has not shipped yet. Calm, not an error. */
export function NotAvailable({ what, className }: { what: string; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-block bg-surface-2 px-5 py-5', className)}>
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      <div>
        <p className="text-[14px] font-semibold text-ink">{what} is not available yet</p>
        <p className="mt-0.5 text-[13px] leading-5 text-ink-2">The server has not published this part of the twin. The rest of the page works without it.</p>
      </div>
    </div>
  )
}

/** Error or "not available yet", depending on the status code. */
export function LoadProblem({ error, what, onRetry, className }: { error: Error; what: string; onRetry?: () => void; className?: string }) {
  if (isNotAvailable(error)) return <NotAvailable what={what} className={className} />
  return <ErrorState title={`${what} did not load`} body={error.message} onRetry={onRetry} className={className} />
}

export function OfflineState({ since, className }: { since: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-block bg-surface-2 px-4 py-3 text-[13px] text-ink-2', className)}>
      <WifiOff className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      Device offline since {since}. Showing the last known values.
    </div>
  )
}
