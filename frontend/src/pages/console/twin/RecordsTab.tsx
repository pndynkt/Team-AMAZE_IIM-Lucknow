import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { api } from '@/api/client'
import type { Freshness as FreshnessT } from '@/api/types'
import { Glyph, type GlyphName } from '@/brand'
import { LinkButton } from '@/components/ui/Button'
import { Chip, SimulatedTag } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { Freshness } from '@/components/domain/Chips'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { firstName, type TabBaseProps } from './shared'

export default function RecordsTab({ id, patient, freshness }: TabBaseProps & { freshness: FreshnessT | null }) {
  const p = patient.data
  if (!p) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonCard rows={8} />
        <SkeletonCard rows={8} />
      </div>
    )
  }
  const e = p.ehr
  const first = firstName(p)
  const flags = [e.diabetes && 'Diabetes', e.ckd && 'Kidney disease', e.smoker && 'Smoker', e.prior_mi && 'Earlier heart event'].filter(Boolean) as string[]
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[64ch] text-[14px] leading-6 text-ink-2">
          Everything the twin knows about {first}, in the two streams it joins. Both are synthetic. ABHA <span className="tnum">{p.abha_masked}</span>, masked.
        </p>
        {api.exportWellnessUrl(id) ? (
          <div className="flex flex-wrap gap-2">
            <LinkButton href={api.exportWellnessUrl(id)} variant="primary" size="sm" icon={<Download />} download>
              Download ABDM WellnessRecord
            </LinkButton>
            <LinkButton href={api.exportEhrUrl(id)} variant="secondary" size="sm" icon={<Download />} download>
              Download source FHIR bundle
            </LinkButton>
          </div>
        ) : (
          <p className="max-w-[34ch] text-[13px] leading-5 text-ink-3">FHIR downloads in this online demo cover the people at the top of the list, Meera Iyer included. Run the app locally to export anyone.</p>
        )}
      </div>

      <section aria-labelledby="rec-ehr" className="panel overflow-hidden">
        <StreamHeader id="rec-ehr" stream="record" title="Health record" body="Synthea-shaped FHIR R4: conditions, medicines, labs, clinic visits, genetics and family history. Changes slowly." />
        <div className="grid gap-x-10 gap-y-8 px-6 pb-6 md:px-7 lg:grid-cols-2">
          <Block title="Conditions" count={e.conditions.length}>
            <Rows
              rows={e.conditions.map((c) => ({
                key: c.code,
                main: c.display,
                sub: (
                  <span className="tnum">
                    {c.system} {c.code}
                  </span>
                ),
                aside: <span className="tnum">since {fmtDate(c.onset)}</span>,
              }))}
            />
          </Block>
          <Block title="Medicines" count={e.medications.length} note="Share of the last 30 days taken, from refills and self-report">
            <Rows
              rows={e.medications.map((m) => ({
                key: m.name,
                main: m.name,
                sub: m.class,
                aside: (
                  <span className="flex items-center gap-2.5">
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-mist-deep" aria-hidden>
                      <span className={cn('block h-full rounded-full', m.adherence_30d_pct >= 80 ? 'bg-leaf' : m.adherence_30d_pct >= 60 ? 'bg-turmeric' : 'bg-sindoor')} style={{ width: `${m.adherence_30d_pct}%` }} />
                    </span>
                    <span className={cn('w-10 text-right tnum font-medium', m.adherence_30d_pct < 80 ? 'text-turmeric' : 'text-ink')}>{m.adherence_30d_pct}%</span>
                  </span>
                ),
              }))}
            />
          </Block>
          <Block title="Latest labs" count={e.labs.length}>
            <Rows
              rows={e.labs.map((l) => ({
                key: l.loinc,
                main: l.name,
                sub: (
                  <span className="tnum">
                    LOINC {l.loinc}, {fmtDate(l.date)}
                  </span>
                ),
                aside: (
                  <span className="flex items-center gap-2.5">
                    <span className="tnum font-medium text-ink">
                      {l.value}
                      {l.unit === '%' ? '%' : <span className="font-normal text-ink-2"> {l.unit}</span>}
                    </span>
                    {l.flag === 'high' ? <Chip tone="sindoor">High</Chip> : l.flag === 'low' ? <Chip tone="turmeric">Low</Chip> : <Chip tone="leaf">In range</Chip>}
                  </span>
                ),
              }))}
            />
          </Block>
          <div className="space-y-8">
            <Block title="Clinic visit" note={fmtDate(e.vitals_clinic.date)}>
              <dl className="grid grid-cols-3 gap-4 text-[13px]">
                <Kv k="Blood pressure" v={`${e.vitals_clinic.sbp}/${e.vitals_clinic.dbp}`} unit="mmHg" />
                <Kv k="BMI" v={e.vitals_clinic.bmi.toFixed(1)} />
                <Kv k="Also" v={flags.join(', ') || 'Nothing else'} small />
              </dl>
            </Block>
            <Block title="Genetics and family" glyph="genetics">
              <p className="text-[14px] text-ink">
                <span className="capitalize">{e.genetics.polygenic_risk_tier}</span> polygenic risk tier for coronary artery disease <SimulatedTag className="ml-1 align-middle" />
              </p>
              {e.family_history.length ? (
                <ul className="mt-2 space-y-1 text-[14px] text-ink-2">
                  {e.family_history.map((h) => (
                    <li key={h} className="flex items-center gap-2">
                      <Glyph name="family" size={14} tone="current" className="text-ink-3" />
                      {h}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[14px] text-ink-2">No family history recorded.</p>
              )}
            </Block>
          </div>
        </div>
      </section>

      <section aria-labelledby="rec-wear" className="panel overflow-hidden">
        <StreamHeader id="rec-wear" stream="wearable" title="Wearable devices and data" body="The watch and the home BP cuff. Arrives every sync, scored every night against the person's own usual." />
        <div className="grid gap-x-10 gap-y-8 px-6 pb-6 md:px-7 lg:grid-cols-2">
          <Block title="Devices">
            <Rows
              rows={[
                {
                  key: 'watch',
                  main: (
                    <span className="inline-flex items-center gap-2">
                      {p.device.brand} {p.device.model}
                      {p.device.simulated && <SimulatedTag />}
                    </span>
                  ),
                  sub: `Source: ${p.device.source === 'simulated' ? 'cohort generator' : p.device.source.replace('_', ' ')}${p.device.sync_interval ? `, syncs ${p.device.sync_interval}` : ''}`,
                  aside: freshness ? <Freshness f={freshness} /> : null,
                },
                { key: 'cuff', main: 'Home BP cuff', sub: 'Readings typed in by the person or synced over Bluetooth', aside: <span className="text-[13px] text-ink-2">Morning readings</span> },
              ]}
            />
          </Block>
          <Block title="What the twin has" note={`${p.baselines.nights_available} nights in total`}>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
              {(
                [
                  ['heart', 'Overnight heart rate'],
                  ['hrv', 'HRV, RMSSD'],
                  ['sleep', 'Sleep and stages'],
                  ['steps', 'Steps'],
                  ['resp', 'Breathing rate'],
                  ['spo2', 'SpO2'],
                  ['bp', 'Home BP'],
                ] as [GlyphName, string][]
              ).map(([g, label]) => (
                <li key={label} className="flex items-center gap-2 text-ink">
                  <Glyph name={g} size={16} tone="identity" />
                  {label}
                </li>
              ))}
            </ul>
          </Block>
          <Block title={`${first}'s usual`} note="Learned from earlier nights only, never from the future">
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <Kv k="Resting heart rate" v={p.baselines.rhr_28d_median.toFixed(1)} unit="bpm, 28 nights" />
              <Kv k="Home systolic BP" v={p.baselines.sbp_28d_mean.toFixed(1)} unit="mmHg, 28 days" />
              <Kv k="HRV" v={p.baselines.lnrmssd_60d_mean.toFixed(2)} unit="lnRMSSD, 60 nights" />
              <Kv k="Smallest change that matters" v={p.baselines.lnrmssd_swc.toFixed(2)} unit="lnRMSSD" />
            </dl>
          </Block>
          <Block title="Export">
            <p className="text-[14px] leading-6 text-ink-2">The ABDM WellnessRecord bundle carries the wearable observations with LOINC codes (heart rate 8867-4, RMSSD 80404-7, sleep 93832-4, steps 55423-8, BP 8480-6 and 8462-4) so a personal health record app can read them.</p>
          </Block>
        </div>
      </section>
    </div>
  )
}

function StreamHeader({ id, stream, title, body }: { id: string; stream: 'record' | 'wearable'; title: string; body: string }) {
  const record = stream === 'record'
  return (
    <header className={cn('mb-6 flex items-start gap-3 border-b px-6 py-5 md:px-7', record ? 'border-sandalwood/20 bg-sandalwood-soft/50' : 'border-peacock/15 bg-peacock-soft/45')}>
      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface', record ? 'text-sandalwood' : 'text-peacock')}>
        <Glyph name={record ? 'record' : 'live'} size={20} tone="current" />
      </span>
      <div>
        <h2 id={id} className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-[13.5px] leading-5 text-ink-2">{body}</p>
      </div>
    </header>
  )
}

function Block({ title, count, note, glyph, children }: { title: string; count?: number; note?: string; glyph?: GlyphName; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2">
        <h3 className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          {glyph && <Glyph name={glyph} size={16} tone="identity" />}
          {title}
          {typeof count === 'number' && <span className="tnum text-[13px] font-normal text-ink-3">{count}</span>}
        </h3>
        {note && <span className="text-[12.5px] text-ink-2">{note}</span>}
      </div>
      {children}
    </div>
  )
}

function Rows({ rows }: { rows: { key: string; main: ReactNode; sub?: ReactNode; aside?: ReactNode }[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center justify-between gap-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[14px] text-ink">{r.main}</p>
            {r.sub && <p className="text-[12.5px] text-ink-2">{r.sub}</p>}
          </div>
          {r.aside && <div className="shrink-0 text-[13.5px]">{r.aside}</div>}
        </li>
      ))}
    </ul>
  )
}

function Kv({ k, v, unit, small }: { k: string; v: string; unit?: string; small?: boolean }) {
  return (
    <div>
      <dt className="text-ink-2">{k}</dt>
      <dd className={cn('mt-0.5 tnum font-semibold text-ink', small ? 'text-[14px]' : 'text-[17px]')}>
        {v} {unit && <span className="text-[12.5px] font-normal text-ink-2">{unit}</span>}
      </dd>
    </div>
  )
}
