import type { Device, Freshness } from '@/api/types'
import { Glyph } from '@/brand'
import { SimulatedTag } from '@/components/ui/Chip'
import { fmtDateTime, freshnessText } from '@/lib/format'
import { cn } from '@/lib/cn'

/** Data freshness in words with a status dot: "Synced 47 min ago". */
export function Freshness({ f, className, prefix }: { f: Freshness; className?: string; prefix?: string }) {
  const dot = f.label === 'fresh' ? 'bg-leaf' : f.label === 'stale' ? 'bg-turmeric' : 'bg-stone'
  const text = freshnessText(f)
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-2', className)} title={`Last sample ${fmtDateTime(f.last_sample_at)}`}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      {prefix ? `${prefix} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text}
      {f.label !== 'fresh' && <span className="sr-only">, data is {f.label}</span>}
    </span>
  )
}

/** The watch the person wears, with the simulated tag when it comes from the generator. */
export function DeviceLabel({ device, className, showModel = true }: { device: Pick<Device, 'brand' | 'simulated'> & Partial<Device>; className?: string; showModel?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-2', className)}>
      <Glyph name="live" size={15} tone="current" className="text-peacock" />
      <span title={device.model ? `${device.brand} ${device.model}` : device.brand}>
        {device.brand}
        {showModel && device.model ? ` ${device.model}` : ''}
      </span>
      {device.simulated && <SimulatedTag />}
    </span>
  )
}
