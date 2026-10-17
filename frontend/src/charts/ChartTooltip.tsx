import type { ReactNode } from 'react'

export interface TooltipRow {
  label: string
  value: ReactNode
  swatch?: string
  dashed?: boolean
  band?: boolean
}

/** Solid tooltip card shared by every chart. */
export function ChartTooltipCard({ title, rows, footer }: { title: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-[180px] max-w-[280px] rounded-block border border-line bg-surface px-3.5 py-3 text-[12.5px] shadow-lift">
      <p className="mb-2 font-semibold text-ink">{title}</p>
      <dl className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-ink-2">
              {r.swatch && <Swatch color={r.swatch} dashed={r.dashed} band={r.band} />}
              {r.label}
            </dt>
            <dd className="tnum font-semibold text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      {footer && <p className="mt-2 border-t border-line pt-2 text-[12px] leading-4 text-ink-2">{footer}</p>}
    </div>
  )
}

export function Swatch({ color, dashed, band }: { color: string; dashed?: boolean; band?: boolean }) {
  if (band) return <span className="inline-block h-2.5 w-3.5 rounded-[3px]" style={{ background: color, opacity: 0.35 }} aria-hidden />
  return (
    <svg width="16" height="6" aria-hidden className="shrink-0">
      <line x1="1" x2="15" y1="3" y2="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? '4 3' : undefined} />
    </svg>
  )
}
