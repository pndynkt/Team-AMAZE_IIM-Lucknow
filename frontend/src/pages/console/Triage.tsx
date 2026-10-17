import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, ChevronRight, Search } from 'lucide-react'
import { api } from '@/api/client'
import { useApi } from '@/api/hooks'
import type { Tier, TriagePatient } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { TierChip, NsState } from '@/components/ui/TierChip'
import { Sparkline } from '@/components/ui/Sparkline'
import { Tabs } from '@/components/ui/Tabs'
import { SkeletonTable, Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { DeviceLabel, Freshness } from '@/components/domain/Chips'
import { useMeta } from '@/lib/meta'
import { fmtDayFull, fmtSigned, sexWord } from '@/lib/format'
import { cn } from '@/lib/cn'

type SortKey = 'risk' | 'rise' | 'sync' | 'name'
type TierFilter = 'all' | Tier
const PAGE = 25

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'risk', label: 'Highest risk first' },
  { key: 'rise', label: 'Biggest rise this week' },
  { key: 'sync', label: 'Most recent sync' },
  { key: 'name', label: 'Name' },
]

export default function Triage() {
  const navigate = useNavigate()
  const { meta } = useMeta()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const tier = (params.get('tier') as TierFilter | null) ?? 'all'
  const q = params.get('q') ?? ''
  const [sort, setSort] = useState<SortKey>('risk')
  const [shown, setShown] = useState(PAGE)
  const [more, setMore] = useState(false)
  const [localQ, setLocalQ] = useState(q)
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  useEffect(() => setLocalQ(q), [q])
  useEffect(() => setShown(PAGE), [tier, q, sort])

  // The whole cohort is 240 rows: fetch once, then filter and sort here so the summary stays whole.
  const { data, error, loading, refetch } = useApi(() => api.patients({ sort: 'risk_score' }), [])
  const budget = useApi(() => api.alerts({ status: 'open' }), [])

  useEffect(() => {
    if (error) toast.error('Could not load the list of people', refetch, error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const counts = useMemo(() => {
    const ps = data?.patients ?? []
    return { all: ps.length, urgent: ps.filter((p) => p.tier === 'urgent').length, watch: ps.filter((p) => p.tier === 'watch').length, low: ps.filter((p) => p.tier === 'low').length }
  }, [data])

  const rows = useMemo(() => {
    let list = [...(data?.patients ?? [])]
    if (tier !== 'all') list = list.filter((p) => p.tier === tier)
    if (q) {
      const n = q.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(n) || p.id.toLowerCase().includes(n) || p.city.toLowerCase().includes(n))
    }
    list.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'sync':
          return a.freshness.minutes_ago - b.freshness.minutes_ago
        case 'rise':
          return b.risk_delta_7d - a.risk_delta_7d
        default:
          return (b.risk_score ?? -1) - (a.risk_score ?? -1)
      }
    })
    return list
  }, [data, tier, q, sort])

  const setTier = (t: TierFilter) => {
    const next = new URLSearchParams(params)
    if (t === 'all') next.delete('tier')
    else next.set('tier', t)
    setParams(next, { replace: true })
  }
  const applyQ = (value: string) => {
    const next = new URLSearchParams(params)
    if (value.trim()) next.set('q', value.trim())
    else next.delete('q')
    setParams(next, { replace: true })
  }

  const s = data?.summary
  const b = budget.data?.budget
  const rate = s?.false_alert_rate_per_patient_day ?? b?.observed_validation
  const target = b?.target_false_alerts_per_patient_day

  const moveFocus = (from: HTMLElement, dir: 1 | -1) => {
    const rowsEls = Array.from(bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row]') ?? [])
    const i = rowsEls.indexOf(from as HTMLTableRowElement)
    rowsEls[Math.max(0, Math.min(rowsEls.length - 1, i + dir))]?.focus()
  }

  return (
    <div>
      <header className="mb-8 max-w-4xl">
        {s ? (
          <h1 className="text-[30px] font-650 leading-[1.2] tracking-[-0.025em] text-ink md:text-[34px]">
            <span className="block">
              <span className="text-sindoor tnum">{s.urgent}</span> {s.urgent === 1 ? 'person needs' : 'people need'} attention today.
            </span>
            <span className="block text-ink-2">
              <span className="text-turmeric tnum">{s.watch}</span> {s.watch === 1 ? 'is' : 'are'} worth a check-in. <span className="text-leaf tnum">{s.low}</span> {s.low === 1 ? 'is' : 'are'} steady.
            </span>
          </h1>
        ) : loading ? (
          <Skeleton className="mt-3 h-10 w-[640px] max-w-full" />
        ) : (
          <h1 className="mt-2 text-[30px] font-650 tracking-[-0.025em]">Today</h1>
        )}
        {typeof rate === 'number' && (
          <p className="mt-3 text-[15px] leading-6 text-ink-2">
            As of {fmtDayFull(meta.as_of)}. False alerts are running at <span className="tnum font-semibold text-ink">{rate.toFixed(3)}</span> a patient-day
            {typeof target === 'number' ? (
              <>
                , {rate <= target ? 'inside' : 'over'} the budget of <span className="tnum">{target.toFixed(3)}</span>.
              </>
            ) : (
              '.'
            )}{' '}
            {s && s.open_alerts > 0 && (
              <>
                <span className="tnum">{s.open_alerts}</span> alerts are open.
              </>
            )}
          </p>
        )}
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs
          variant="segmented"
          aria-label="Show"
          value={tier}
          onChange={setTier}
          items={[
            { key: 'all', label: 'Everyone', badge: <Count n={counts.all} /> },
            { key: 'urgent', label: 'Needs attention', badge: <Count n={counts.urgent} /> },
            { key: 'watch', label: 'Check in', badge: <Count n={counts.watch} /> },
            { key: 'low', label: 'Steady', badge: <Count n={counts.low} /> },
          ]}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            applyQ(localQ)
          }}
          className="relative"
          role="search"
        >
          <label htmlFor="triage-q" className="sr-only">
            Search name, ID or city
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input id="triage-q" value={localQ} onChange={(e) => setLocalQ(e.target.value)} onBlur={() => localQ !== q && applyQ(localQ)} placeholder="Name, ID or city" className="field h-9 w-44 rounded-[10px] pl-9 text-[13.5px] 2xl:w-64" />
        </form>
        {q && (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setLocalQ('')
              applyQ('')
            }}
          >
            Clear search
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="triage-sort" className="sr-only">
            Sort
          </label>
          <select id="triage-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="field h-9 rounded-[10px] py-0 pl-3 pr-8 text-[13.5px]">
            {SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <Button variant={more ? 'soft' : 'secondary'} size="sm" className="h-9" aria-pressed={more} onClick={() => setMore((m) => !m)}>
            {more ? 'Fewer columns' : 'More columns'}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <SkeletonTable rows={10} cols={6} />
      ) : error && !data ? (
        <ErrorState title="The list did not load" body={error.message} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No one matches"
          body="Try another group or clear the search."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLocalQ('')
                setParams(new URLSearchParams(), { replace: true })
              }}
            >
              Show everyone
            </Button>
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[930px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[12.5px] font-medium text-ink-2">
                  <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">
                    Person
                  </th>
                  <th scope="col" className="min-w-[230px] px-3 py-2.5 font-medium">
                    Why
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Risk, next 72 h
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    <span className="sr-only">Last 7 nights: </span>
                    <span className="flex gap-3" aria-hidden>
                      <span className="w-[60px]">Heart rate</span>
                      <span className="w-[60px]">BP</span>
                    </span>
                  </th>
                  {more && (
                    <>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Change this week
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Rule state
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Wear time
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Watch
                      </th>
                    </>
                  )}
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Data
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Alert
                  </th>
                  <th scope="col" className="hidden w-10 pr-4 2xl:table-cell">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={bodyRef}>
                {rows.slice(0, shown).map((p) => (
                  <TriageRow key={p.id} p={p} more={more} onOpen={() => navigate(`/console/patients/${p.id}`)} onMove={moveFocus} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-2">
            <span className="tnum">
              Showing {Math.min(shown, rows.length)} of {rows.length}
            </span>
            <span className="hidden text-ink-3 md:inline">Arrow keys move between people. Enter opens the twin.</span>
            {shown < rows.length && (
              <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, rows.length - shown)} more
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="tnum text-[12.5px] font-normal text-ink-3">{n}</span>
}

function TriageRow({ p, more, onOpen, onMove }: { p: TriagePatient; more: boolean; onOpen: () => void; onMove: (from: HTMLElement, dir: 1 | -1) => void }) {
  const delta = p.risk_delta_7d
  return (
    <tr
      data-row
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          onMove(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1)
        }
      }}
      className="group cursor-pointer border-b border-line align-middle transition-colors last:border-0 hover:bg-peacock-soft/40 focus-visible:bg-peacock-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-peacock"
      aria-label={`${p.name}, ${p.tier === 'opted_out' ? 'predictions off' : `risk ${p.risk_score}, ${p.tier}`}. ${p.top_reason}`}
    >
      <td className="py-3 pl-5 pr-3">
        <div className="whitespace-nowrap font-semibold text-ink">{p.name}</div>
        <div className="mt-0.5 flex gap-2.5 whitespace-nowrap text-[13px] text-ink-2">
          <span className="tnum">{p.age}</span>
          <span>{sexWord(p.sex)}</span>
          <span>{p.city}</span>
        </div>
      </td>
      <td className="max-w-[340px] px-3 py-3">
        <p className="line-clamp-2 text-[13.5px] leading-5 text-ink" title={p.top_reason}>
          {p.top_reason}
        </p>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="w-7 text-right tnum text-[18px] font-semibold tracking-[-0.02em] text-ink">{p.risk_score ?? '--'}</span>
          <TierChip tier={p.tier} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Trend label="Heart rate" values={p.sparklines.rhr} color="var(--hex-lotus)" unit="bpm" />
          <Trend label="BP" values={p.sparklines.sbp} color="var(--hex-peacock)" unit="mmHg" />
        </div>
      </td>
      {more && (
        <>
          <td className={cn('px-3 py-3 tnum font-medium', p.risk_score === null ? 'text-ink-3' : delta > 0 ? 'text-sindoor' : 'text-ink-2')}>{p.risk_score === null ? '--' : fmtSigned(delta)}</td>
          <td className="px-3 py-3">
            <NsState state={p.ns_state} />
          </td>
          <td className={cn('px-3 py-3 tnum', p.wear_time_pct_7d < 50 ? 'font-medium text-turmeric' : 'text-ink-2')}>{p.wear_time_pct_7d}%</td>
          <td className="px-3 py-3">
            <DeviceLabel device={p.device} showModel={false} />
          </td>
        </>
      )}
      <td className="px-3 py-3">
        <Freshness f={p.freshness} />
      </td>
      <td className="px-3 py-3">
        {p.escalation_status ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-sindoor">
            <span className="h-1.5 w-1.5 rounded-full bg-sindoor" aria-hidden /> Escalating
          </span>
        ) : p.open_alert_id ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-ink">
            <Bell className="h-3.5 w-3.5 text-ink-2" aria-hidden /> Open
          </span>
        ) : (
          <span className="sr-only">No open alert</span>
        )}
      </td>
      <td className="hidden pr-4 text-ink-3 2xl:table-cell">
        <ChevronRight className="h-4 w-4 transition-colors group-hover:text-ink" aria-hidden />
      </td>
    </tr>
  )
}

function Trend({ label, values, color, unit }: { label: string; values: (number | null)[]; color: string; unit: string }) {
  const nums = values.filter((v): v is number => typeof v === 'number')
  return (
    <Sparkline values={values} width={60} height={24} color={color} label={nums.length >= 2 ? `${label} over 7 nights, ${nums[0]} to ${nums[nums.length - 1]} ${unit}` : `${label}: not enough data`} />
  )
}
