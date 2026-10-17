import type { ReactNode } from 'react'
import { Glyph } from '@/brand'
import { cn } from '@/lib/cn'

export type Stream = 'record' | 'wearable'

export const STREAM_LABEL: Record<Stream, string> = { record: 'Health record', wearable: 'Wearable' }

/** "Health record" in sandalwood or "Wearable" in peacock: the two streams the twin fuses. */
export function StreamTag({ stream, className, size = 'sm', children }: { stream: Stream; className?: string; size?: 'sm' | 'md'; children?: ReactNode }) {
  const record = stream === 'record'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium',
        size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-2.5 text-[13px]',
        record ? 'bg-sandalwood-soft text-sandalwood-text' : 'bg-peacock-soft text-peacock-deep dark:text-peacock',
        className,
      )}
    >
      <Glyph name={record ? 'record' : 'live'} size={size === 'sm' ? 13 : 15} tone="current" />
      {children ?? STREAM_LABEL[stream]}
    </span>
  )
}

/** A thin vertical rule in the stream colour, for list sections. */
export function StreamRule({ stream, className }: { stream: Stream; className?: string }) {
  return <span className={cn('block w-[3px] shrink-0 rounded-full', stream === 'record' ? 'bg-sandalwood' : 'bg-peacock', className)} aria-hidden />
}
