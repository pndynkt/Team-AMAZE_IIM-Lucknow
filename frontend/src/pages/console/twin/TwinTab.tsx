import { useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { api } from '@/api/client'
import { useApi } from '@/api/hooks'
import type { AnnotationKind } from '@/api/types'
import { Glyph } from '@/brand'
import { Panel } from '@/components/ui/Panel'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Stat } from '@/components/ui/Stat'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { LiveTicker } from '@/components/domain/LiveTicker'
import { TwinChart } from '@/charts/TwinChart'
import { IntradayChart } from '@/charts/IntradayChart'
import { useMeta } from '@/lib/meta'
import { fmtDay, fmtDayLong, fmtPct, fmtSleep, fmtTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { firstName, usualLabel, type TwinTabProps } from './shared'

type Days = '30' | '60' | '120'
const KIND_WORD: Record<AnnotationKind, string> = { note: 'Clinician note', symptom: 'Symptom', missed_dose: 'Missed dose', meal: 'Meal' }

export default function TwinTab({ id, patient, forecast }: TwinTabProps) {
  const { meta, clinician } = useMeta()
  const toast = useToast()
  const [days, setDays] = useState<Days>('30')
  const [selected, setSelected] = useState<string>(meta.as_of)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteKind, setNoteKind] = useState<AnnotationKind>('note')
  const [saving, setSaving] = useState(false)
  const p = patient.data
  const first = firstName(p)

  useEffect(() => setSelected(meta.as_of), [meta.as_of, id])

  const timeline = useApi(() => api.timeline(id, Number(days)), [id, days])
  const intraday = useApi(() => api.intraday(id, selected), [id, selected])

  useEffect(() => {
    if (timeline.error) toast.error('Could not load the timeline', timeline.refetch, timeline.error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.error])

  const f = forecast.data
  const t = timeline.data
  const selectedRow = useMemo(() => t?.rows.find((r) => r.date === selected) ?? null, [t, selected])
  const annotations = useMemo(() => [...(t?.annotations ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)), [t])

  const saveNote = async () => {
    if (!noteText.trim()) return
    setSaving(true)
    try {
      await api.annotatePatient(id, { date: selected, kind: noteKind, label: noteText.trim(), by: clinician })
      toast.success('Note added', `${fmtDayLong(selected)}: ${noteText.trim()}`)
      setNoteText('')
      setNoteOpen(false)
      await timeline.refetch()
    } catch (e) {
      toast.error('Could not save the note', saveNote, e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-8">
        <section className="panel">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 md:px-6">
            <h2 className="mr-auto text-[16px] font-semibold">{first}'s twin, day by day</h2>
            <Tabs variant="segmented" size="sm" aria-label="Days shown" value={days} onChange={setDays} items={[{ key: '30', label: '30 days' }, { key: '60', label: '60 days' }, { key: '120', label: '120 days' }]} />
          </div>
          <div className="px-4 pb-5 pt-4 md:px-5">
            {timeline.loading && !t ? (
              <div className="space-y-4" aria-busy="true">
                <Skeleton className="h-4 w-80" />
                <Skeleton className="h-[228px] w-full" />
                <Skeleton className="h-[136px] w-full" />
                <Skeleton className="h-[192px] w-full" />
              </div>
            ) : timeline.error && !t ? (
              <ErrorState title="The timeline did not load" body={timeline.error.message} onRetry={timeline.refetch} />
            ) : t ? (
              <TwinChart timeline={t} forecast={f} asOf={meta.as_of} selectedDate={selected} onSelectDate={setSelected} usualLabel={usualLabel(p)} />
            ) : null}
            <p className="mt-2 px-1 text-[12.5px] text-ink-2">Select a day on the chart to see its 5-minute heart rate on the right.</p>
          </div>

          <div className="border-t border-line px-5 py-4 md:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[13.5px] font-semibold text-ink">Notes on the timeline</span>
              {annotations.length === 0 && <span className="text-[13px] text-ink-2">None in this window.</span>}
              {annotations.map((a, i) => (
                <button
                  key={`${a.date}-${i}`}
                  type="button"
                  onClick={() => setSelected(a.date)}
                  className={cn('inline-flex h-8 max-w-[300px] items-center gap-2 rounded-full border px-3 text-[13px] transition-colors hover:bg-surface-2', a.date === selected ? 'border-peacock bg-peacock-soft/60' : 'border-line bg-surface')}
                  title={`${KIND_WORD[a.kind]} by ${a.by === 'patient' ? 'the person' : a.by}`}
                >
                  <span className="tnum shrink-0 whitespace-nowrap text-ink-2">{fmtDay(a.date)}</span>
                  <span className="truncate text-ink">{a.label}</span>
                </button>
              ))}
              <Button size="sm" variant="secondary" className="ml-auto" icon={<MessageSquarePlus />} onClick={() => setNoteOpen((o) => !o)} aria-expanded={noteOpen}>
                Add a note
              </Button>
            </div>
            {noteOpen && (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveNote()
                }}
              >
                <label className="sr-only" htmlFor="note-kind">
                  Kind of note
                </label>
                <select id="note-kind" value={noteKind} onChange={(e) => setNoteKind(e.target.value as AnnotationKind)} className="field h-9 rounded-[10px] py-0 text-[13.5px]">
                  <option value="note">Clinician note</option>
                  <option value="symptom">Symptom</option>
                  <option value="missed_dose">Missed dose</option>
                  <option value="meal">Meal</option>
                </select>
                <span className="text-[13px] text-ink-2">on {fmtDayLong(selected)}</span>
                <label className="sr-only" htmlFor="note-text">
                  Note
                </label>
                <input id="note-text" autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Called, advised an evening BP check" className="field h-9 min-w-[260px] flex-1 rounded-[10px] text-[13.5px]" />
                <Button size="sm" type="submit" loading={saving} disabled={!noteText.trim()}>
                  Save note
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setNoteOpen(false)}>
                  Cancel
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-5 xl:col-span-4">
        <Panel title={fmtDayLong(selected)} subtitle="Heart rate every 5 minutes. The overnight window feeds the twin." lead={<Glyph name="heart" size={18} tone="identity" />}>
          {intraday.loading && !intraday.data ? (
            <Skeleton className="h-[184px] w-full" />
          ) : intraday.error ? (
            <ErrorState title="This day did not load" body={intraday.error.message} onRetry={intraday.refetch} />
          ) : intraday.data && intraday.data.samples.length > 0 ? (
            <>
              <IntradayChart intraday={intraday.data} height={184} />
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="Overnight" value={intraday.data.overnight_rhr.toFixed(1)} unit="bpm" size="sm" />
                <Stat label="Samples" value={intraday.data.samples.length} size="sm" hint={`every ${intraday.data.interval_min} min`} />
                <Stat label="Last sample" value={fmtTime(intraday.data.samples[intraday.data.samples.length - 1].t)} size="sm" />
              </div>
              {selectedRow && (
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-line pt-4 text-[13px]">
                  <Row glyph="sleep" k="Sleep" v={selectedRow.sleep_min !== null ? fmtSleep(selectedRow.sleep_min) : 'Not recorded'} />
                  <Row k="Sleep efficiency" v={selectedRow.sleep_eff !== null ? fmtPct(selectedRow.sleep_eff) : 'Not recorded'} />
                  <Row glyph="steps" k="Steps" v={selectedRow.steps !== null ? Math.round(selectedRow.steps).toLocaleString('en-IN') : 'Not recorded'} />
                  <Row glyph="bp" k="Home BP" v={selectedRow.sbp_home !== null ? `${selectedRow.sbp_home}/${selectedRow.dbp_home}` : 'Not taken'} />
                  <Row glyph="resp" k="Breathing" v={selectedRow.resp_rate !== null ? `${selectedRow.resp_rate} a min` : 'Not recorded'} />
                  <Row glyph="spo2" k="SpO2" v={selectedRow.spo2 !== null ? `${selectedRow.spo2}%` : 'Not recorded'} />
                </dl>
              )}
            </>
          ) : (
            <EmptyState title="The watch was not worn" body={`There are no samples on ${fmtDayLong(selected)}. Pick another day on the chart.`} />
          )}
        </Panel>

        <Panel title="Live stream" subtitle="The watch sends a sample every 5 minutes." lead={<Glyph name="live" size={18} tone="identity" animated />}>
          <LiveTicker id={id} usual={p?.baselines.rhr_28d_median} />
        </Panel>
      </div>
    </div>
  )
}

function Row({ k, v, glyph }: { k: string; v: string; glyph?: 'sleep' | 'steps' | 'bp' | 'resp' | 'spo2' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="inline-flex items-center gap-1.5 text-ink-2">
        {glyph && <Glyph name={glyph} size={14} tone="identity" />}
        {k}
      </dt>
      <dd className="tnum font-medium text-ink">{v}</dd>
    </div>
  )
}
