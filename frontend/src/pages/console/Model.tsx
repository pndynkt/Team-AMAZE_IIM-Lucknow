import { useEffect } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/api/client'
import { useApi } from '@/api/hooks'
import type { ModelCard, ModelMetrics } from '@/api/types'
import { repeatedOf, splitCount } from '@/lib/modelNumbers'
import { Glyph } from '@/brand'
import { PageHeader } from '@/components/layout/ConsoleShell'
import { Panel } from '@/components/ui/Panel'
import { Chip, SimulatedTag } from '@/components/ui/Chip'
import { Stat } from '@/components/ui/Stat'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState, NotAvailable } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { CalibrationChart, FeatureImportanceChart } from '@/charts/ModelCharts'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/cn'

const COLS: { key: keyof ModelMetrics; label: string; fmt: (v: number) => string; best: 'high' | 'low' }[] = [
  { key: 'auroc', label: 'AUROC', fmt: (v) => v.toFixed(2), best: 'high' },
  { key: 'auprc', label: 'AUPRC', fmt: (v) => v.toFixed(2), best: 'high' },
  { key: 'sensitivity', label: 'Caught at the budget', fmt: (v) => fmtPct(v), best: 'high' },
  { key: 'sensitivity_48h_lead', label: 'Caught 48 h early', fmt: (v) => fmtPct(v), best: 'high' },
  { key: 'specificity', label: 'Specificity', fmt: (v) => fmtPct(v), best: 'high' },
  { key: 'false_alerts_per_patient_day', label: 'False alerts a patient-day', fmt: (v) => v.toFixed(3), best: 'low' },
  { key: 'median_lead_hours', label: 'Median warning', fmt: (v) => `${Math.round(v)} h`, best: 'high' },
  { key: 'brier', label: 'Brier', fmt: (v) => v.toFixed(3), best: 'low' },
]
type RowKey = 'fused' | 'fused_no_twin' | 'wearable_only' | 'watch_only' | 'ehr_only' | 'rule_only' | 'ceiling_wearable_plus_oracle_prior'
const ROWS: { key: RowKey; label: string; sub: string; streams: ('record' | 'wearable')[]; muted?: boolean }[] = [
  { key: 'fused', label: 'Fused', sub: 'Watch, home BP cuff and health record, with the personal physiology engine', streams: ['wearable', 'record'] },
  { key: 'fused_no_twin', label: 'Fused, no personal engine', sub: 'The same streams without the personal adjustment', streams: ['wearable', 'record'] },
  { key: 'wearable_only', label: 'Watch and cuff', sub: 'Heart rate, HRV, sleep, steps, SpO2, breathing, home BP', streams: ['wearable'] },
  { key: 'watch_only', label: 'Watch only', sub: 'No BP cuff', streams: ['wearable'] },
  { key: 'ehr_only', label: 'Health record only', sub: 'Static risk, no timing signal', streams: ['record'] },
  { key: 'rule_only', label: 'Rule only', sub: 'NightSignal-style overnight heart-rate rule', streams: ['wearable'] },
  { key: 'ceiling_wearable_plus_oracle_prior', label: 'Ceiling', sub: 'Watch and cuff with the generator\'s own risk prior', streams: ['wearable'], muted: true },
]

/** "Walking to next-morning systolic bp" to "... BP". */
function tidy(label: string): string {
  return label.replace(/\bbp\b/g, 'BP').replace(/\bhrv\b/g, 'HRV')
}

export default function ModelPage() {
  const toast = useToast()
  const model = useApi(() => api.model(), [])
  useEffect(() => {
    if (model.error) toast.error('Could not load the model card', model.refetch, model.error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.error])
  const m = model.data

  if (model.error && !m) return <ErrorState title="The model card did not load" body={model.error.message} onRetry={model.refetch} />
  if (!m)
    return (
      <div>
        <PageHeader title="Model card" />
        <div className="space-y-5">
          <SkeletonCard rows={6} />
          <SkeletonCard rows={6} />
        </div>
      </div>
    )

  return (
    <div>
      <PageHeader
        title="Model card"
        subtitle={m.task}
        actions={
          <Chip tone={m.leakage_tests.passed ? 'leaf' : 'sindoor'} size="md" icon={m.leakage_tests.passed ? <CheckCircle2 /> : <XCircle />}>
            {m.leakage_tests.passed ? 'Leakage tests passed' : 'Leakage tests failed'}
          </Chip>
        }
      >
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink-2">
          <span>{m.name}</span>
          <span className="tnum">{m.version}</span>
          {m.data.synthetic && <SimulatedTag label={`Synthetic data, seed ${m.data.generator_seed}`} />}
        </p>
      </PageHeader>

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-panel border border-line bg-surface/60 px-6 py-5 md:grid-cols-5" aria-label="Data">
          <Stat label="People" value={fmtNum(m.data.cohort)} size="sm" />
          <Stat label="Patient-days" value={fmtNum(m.data.patient_days)} size="sm" />
          <Stat label="Strain episodes" value={fmtNum(m.data.events)} size="sm" />
          <Stat label="Days in a 72 h window" value={fmtPct(m.data.event_rate, 1)} size="sm" />
          <Stat label="Validation" value={/fold/i.test(m.data.split) ? '5-fold' : m.data.split.replace(/^patient-level\s*/i, '')} size="sm" hint="Split by person" />
        </section>

        <Ablation m={m} />
        <Physiology m={m} />

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Calibration" subtitle="When the model says 20%, about 20% of those windows had an episode. Dot size shows how many patient-days.">
            <CalibrationChart bins={m.calibration.bins} />
            <p className="mt-3 text-[13px] leading-5 text-ink-2">
              Day-one forecast error: heart rate <span className="tnum font-medium text-ink">{m.forecast.rhr_mae_day1} bpm</span>, BP <span className="tnum font-medium text-ink">{m.forecast.sbp_mae_day1} mmHg</span>. The likely range held the reading{' '}
              <span className="tnum font-medium text-ink">{fmtPct(m.forecast.coverage_p10_p90)}</span> of the time.
            </p>
          </Panel>
          <Panel
            title="What the model leans on"
            subtitle={m.features.length > 20 ? `Top 20 of ${m.features.length} features, by gain` : 'Features by gain'}
            action={
              <span className="flex items-center gap-3 text-[12.5px] text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-peacock" /> Wearable
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-sandalwood" /> Health record
                </span>
              </span>
            }
          >
            <FeatureImportanceChart features={[...m.features].sort((a, b) => b.importance - a.importance).slice(0, 20)} />
          </Panel>
        </div>

        <Panel title="Published work it can be read against" subtitle="Real cohorts, different tasks. A sense of scale, not a head-to-head comparison." tone="quiet" className="bg-surface/60">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="border-b border-line-strong text-left text-[12.5px] text-ink-2">
                  <th className="py-2 pr-4 font-medium">Study</th>
                  <th className="px-3 py-2 text-right font-medium">AUROC</th>
                  <th className="px-3 py-2 text-right font-medium">Sensitivity</th>
                  <th className="px-3 py-2 text-right font-medium">Specificity</th>
                  <th className="py-2 pl-3 font-medium">Warning</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {m.published_anchors.map((a) => (
                  <tr key={a.name} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-ink">{a.name}</span>
                      {a.note && <span className="block text-[12.5px] text-ink-2">{a.note}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">{a.auroc !== undefined ? a.auroc.toFixed(2) : a.auroc_gain ?? <span className="text-ink-3">Not given</span>}</td>
                    <td className="px-3 py-2.5 text-right">{a.sensitivity !== undefined ? fmtPct(a.sensitivity) : <span className="text-ink-3">Not given</span>}</td>
                    <td className="px-3 py-2.5 text-right">{a.specificity !== undefined ? fmtPct(a.specificity, 1) : <span className="text-ink-3">Not given</span>}</td>
                    <td className="py-2.5 pl-3 text-ink-2">{a.lead ?? 'Not given'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-8 border-t border-line pt-6 lg:grid-cols-3">
          <section>
            <h2 className="mb-2 text-[16px] font-semibold">What it cannot do</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-5 text-ink-2">
              {m.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-[16px] font-semibold">Leakage tests</h2>
            <ul className="space-y-2 text-[14px]">
              {m.leakage_tests.tests.map((t) => (
                <li key={t} className="flex items-center gap-2 text-ink-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-leaf" aria-hidden />
                  {t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-[16px] font-semibold">Regulatory status</h2>
            <p className="text-[14px] font-medium text-ink">{m.regulatory.status}</p>
            <p className="mt-2 text-[14px] leading-5 text-ink-2">{m.regulatory.cdsco}</p>
            <p className="mt-2 text-[14px] leading-5 text-ink-2">{m.regulatory.dpdp}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function Ablation({ m }: { m: ModelCard }) {
  const rows = ROWS.filter((r) => m.metrics[r.key])
  const splits = splitCount(m)
  // With repeated splits, every cell shows the mean and its range; otherwise the single split.
  const value = (row: RowKey, col: keyof ModelMetrics): { v: number; range?: [number, number] } | null => {
    const rep = repeatedOf(m, row, col)
    if (rep) return { v: rep.mean, range: rep.min !== undefined && rep.max !== undefined ? [rep.min, rep.max] : undefined }
    const v = m.metrics[row]?.[col]
    return typeof v === 'number' ? { v } : null
  }
  const best = (key: keyof ModelMetrics, dir: 'high' | 'low') => {
    const vals = rows
      .filter((r) => !r.muted)
      .map((r) => value(r.key, key)?.v)
      .filter((v): v is number => typeof v === 'number')
    if (!vals.length) return null
    return dir === 'high' ? Math.max(...vals) : Math.min(...vals)
  }
  return (
    <Panel
      title="Each stream alone, and fused"
      subtitle={splits ? `Mean over ${splits} repeated patient splits, with the range under each value. Bold is the best mean in each column, leaving out the ceiling.` : 'Pooled out-of-fold predictions. Bold is the best value in each column, leaving out the ceiling.'}
      padded={false}
    >
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[960px] text-[14px]">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-left text-[12.5px] text-ink-2">
              <th className="px-6 py-2.5 font-medium">Model</th>
              {COLS.map((c) => (
                <th key={c.key} className="px-3 py-2.5 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((r) => (
              <tr key={r.key} className={cn('border-b border-line last:border-0', r.key === 'fused' && 'bg-peacock-soft/40', r.muted && 'text-ink-3')}>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2 font-semibold">
                    {r.label}
                    <span className="inline-flex gap-1">
                      {r.streams.map((st) => (
                        <Glyph key={st} name={st === 'record' ? 'record' : 'live'} size={14} tone="current" className={st === 'record' ? 'text-sandalwood' : 'text-peacock'} />
                      ))}
                    </span>
                  </div>
                  <div className="text-[12.5px] font-normal text-ink-2">{r.sub}</div>
                </td>
                {COLS.map((c) => {
                  const cell = value(r.key, c.key)
                  const b = best(c.key, c.best)
                  return (
                    <td key={c.key} className={cn('whitespace-nowrap px-3 py-3 text-right', !r.muted && cell && cell.v === b ? 'font-semibold text-ink' : r.muted ? 'text-ink-3' : 'text-ink-2')}>
                      {cell ? c.fmt(cell.v) : <span className="text-ink-3">Not run</span>}
                      {cell?.range && (
                        <span className="block text-[11.5px] font-normal text-ink-3">
                          {c.fmt(cell.range[0])} to {c.fmt(cell.range[1])}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 border-t border-line px-6 py-4 text-[14px] leading-[1.55] text-ink-2">
        {m.twin_note && <p className="text-ink">{m.twin_note}</p>}
        <p>{m.ablation_note}</p>
        {m.ceiling_note && <p>{m.ceiling_note}</p>}
      </div>
    </Panel>
  )
}

function Physiology({ m }: { m: ModelCard }) {
  const ph = m.physiology
  return (
    <Panel title="Personal physiology" subtitle="How well the twin recovers each person's own response to sleep and walking. The generator's true slopes are known, so this can be checked directly." lead={<Glyph name="twin" size={18} tone="identity" />}>
      {!ph ? (
        <NotAvailable what="The physiology validation" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-block border border-line">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="bg-surface-2 text-left text-[12.5px] text-ink-2">
                  <th className="px-4 py-2.5 font-medium">Response</th>
                  <th className="px-3 py-2.5 text-right font-medium">Twin error</th>
                  <th className="px-3 py-2.5 text-right font-medium">Per-person fit alone</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cohort average</th>
                  <th className="px-3 py-2.5 text-right font-medium">Match with true slopes</th>
                  <th className="px-3 py-2.5 text-right font-medium">80% interval held</th>
                  <th className="px-4 py-2.5 text-right font-medium">People</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {ph.pairs.map((p) => {
                  const bestMae = Math.min(p.mae_pooled, p.mae_raw, p.mae_population)
                  return (
                    <tr key={p.key} className="border-t border-line">
                      <td className="px-4 py-3 font-medium text-ink">
                        {tidy(p.label)}
                        {p.unit && <span className="block text-[12.5px] font-normal text-ink-2">{p.unit}</span>}
                      </td>
                      <td className={cn('px-3 py-3 text-right', p.mae_pooled === bestMae ? 'font-semibold text-ink' : 'text-ink-2')}>{p.mae_pooled.toFixed(2)}</td>
                      <td className={cn('px-3 py-3 text-right', p.mae_raw === bestMae ? 'font-semibold text-ink' : 'text-ink-2')}>{p.mae_raw.toFixed(2)}</td>
                      <td className={cn('px-3 py-3 text-right', p.mae_population === bestMae ? 'font-semibold text-ink' : 'text-ink-2')}>{p.mae_population.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-ink">
                        <span className="font-semibold">{p.r_pooled.toFixed(2)}</span> <span className="text-ink-3">vs {p.r_raw.toFixed(2)} alone</span>
                      </td>
                      <td className="px-3 py-3 text-right text-ink-2">{fmtPct(p.coverage_80)}</td>
                      <td className="px-4 py-3 text-right text-ink-2">{p.n_patients}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13.5px] leading-5 text-ink-2">
            Error is the mean absolute gap between each person's estimated slope and the true one; lower is better. {ph.method}. {ph.note}
          </p>
        </>
      )}
    </Panel>
  )
}
