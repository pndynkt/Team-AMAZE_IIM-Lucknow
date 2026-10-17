import { cn } from '@/lib/cn'

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('skeleton', className)} style={style} aria-hidden />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${88 - (i % 3) * 18}%` }} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <div className={cn('panel p-5 md:p-6', className)} aria-busy="true" aria-live="polite">
      <Skeleton className="mb-4 h-4 w-1/3" />
      <SkeletonText lines={rows} />
    </div>
  )
}

export function SkeletonTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel overflow-hidden p-0" aria-busy="true" aria-live="polite">
      <div className="border-b border-line px-5 py-3">
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-5 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-3.5" style={{ width: c === 0 ? 160 : 70 + ((r + c) % 3) * 24 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart({ className, height = 240 }: { className?: string; height?: number }) {
  return (
    <div className={cn('panel p-5 md:p-6', className)} aria-busy="true" aria-live="polite">
      <Skeleton className="mb-4 h-4 w-48" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  )
}
