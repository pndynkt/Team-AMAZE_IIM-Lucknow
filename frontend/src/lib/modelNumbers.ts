import type { ModelCard, ModelMetrics, RepeatedValue } from '@/api/types'

/** Reads one repeated-split value whichever of the two accepted shapes the server sends. */
export function repeatedOf(m: ModelCard, row: string, col: string): RepeatedValue | null {
  const rep = m.metrics.repeated as Record<string, unknown> | undefined
  const r = rep?.[row] as Record<string, unknown> | undefined
  if (!r) return null
  const v = r[col] as { mean?: unknown; min?: unknown; max?: unknown } | number | undefined
  if (v && typeof v === 'object' && typeof v.mean === 'number') return { mean: v.mean, min: typeof v.min === 'number' ? v.min : undefined, max: typeof v.max === 'number' ? v.max : undefined }
  const mean = (r.mean as Record<string, unknown> | undefined)?.[col]
  if (typeof mean === 'number') {
    const min = (r.min as Record<string, unknown> | undefined)?.[col]
    const max = (r.max as Record<string, unknown> | undefined)?.[col]
    return { mean, min: typeof min === 'number' ? min : undefined, max: typeof max === 'number' ? max : undefined }
  }
  return null
}

export function splitCount(m: ModelCard): number | null {
  const rep = m.metrics.repeated
  if (!rep) return null
  if (typeof rep.n_splits === 'number') return rep.n_splits
  if (typeof rep.splits === 'number') return rep.splits
  if (Array.isArray(rep.splits)) return rep.splits.length
  return 3
}

/** A headline metric: the repeated-split mean when published, otherwise the single split. */
export function metricOf(m: ModelCard, row: keyof ModelCard['metrics'], col: keyof ModelMetrics): number | undefined {
  const rep = repeatedOf(m, String(row), String(col))
  if (rep) return rep.mean
  const v = (m.metrics[row] as ModelMetrics | undefined)?.[col]
  return typeof v === 'number' ? v : undefined
}
