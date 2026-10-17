import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Search, UserRound } from 'lucide-react'
import { api } from '@/api/client'
import { useApi } from '@/api/hooks'
import type { ActorType, AuditEntry } from '@/api/types'
import { Glyph } from '@/brand'
import { PageHeader } from '@/components/layout/ConsoleShell'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

function ActorIcon({ t }: { t: ActorType }) {
  if (t === 'system') return <Glyph name="twin" size={15} tone="current" className="text-peacock" />
  if (t === 'clinician') return <Glyph name="doctor" size={15} tone="current" className="text-ink-2" />
  if (t === 'contact') return <Glyph name="family" size={15} tone="current" className="text-ink-2" />
  return <UserRound className="h-[15px] w-[15px] text-lotus" strokeWidth={1.9} aria-hidden />
}

/** "alert.created" to "Alert created", "escalation.contact_1" to "Escalation contact 1". */
function actionWords(a: string): string {
  const s = a.replace(/[._]/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const BASIS: Record<string, string> = { ai_predictions: 'Predictions', wearable: 'Wearable', ehr: 'Health record', emergency_contacts: 'Emergency contacts', consent: 'Consent' }

export default function AuditPage() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [actor, setActor] = useState<ActorType | 'all'>('all')
  const audit = useApi(() => api.audit({ limit: 200 }), [])
  useEffect(() => {
    if (audit.error) toast.error('Could not load the audit log', audit.refetch, audit.error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.error])

  const rows = useMemo(() => {
    let l = audit.data?.entries ?? []
    if (actor !== 'all') l = l.filter((e) => e.actor_type === actor)
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      l = l.filter((e) => [e.action, e.actor, e.patient_id, e.object, e.detail, e.consent_basis, e.channel].some((v) => v && String(v).toLowerCase().includes(n)))
    }
    return l
  }, [audit.data, q, actor])

  const exportCsv = () => {
    const head = ['id', 'at', 'actor', 'actor_type', 'patient_id', 'action', 'object', 'detail', 'consent_basis', 'channel'] as const
    const lines = [head.join(','), ...rows.map((e) => head.map((k) => JSON.stringify((e as AuditEntry)[k] ?? '')).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pratibimb-audit.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Every score, alert, message and consent change, with the consent it relied on. Entries are only ever added."
        actions={
          <Button variant="secondary" size="sm" icon={<Download />} onClick={exportCsv} disabled={!rows.length}>
            Download CSV
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs
          variant="segmented"
          aria-label="Who acted"
          value={actor}
          onChange={setActor}
          items={[
            { key: 'all', label: 'Everyone' },
            { key: 'system', label: 'The twin' },
            { key: 'clinician', label: 'Clinicians' },
            { key: 'patient', label: 'People' },
            { key: 'contact', label: 'Contacts' },
          ]}
        />
        <div className="relative">
          <label htmlFor="audit-q" className="sr-only">
            Search the log
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input id="audit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, person or detail" className="field h-9 w-72 rounded-[10px] pl-9 text-[13.5px]" />
        </div>
        <span className="ml-auto text-[13px] tnum text-ink-2">{audit.data ? `${rows.length} of ${audit.data.entries.length} entries` : ''}</span>
      </div>

      {audit.loading && !audit.data ? (
        <SkeletonTable rows={10} cols={5} />
      ) : audit.error && !audit.data ? (
        <ErrorState title="The audit log did not load" body={audit.error.message} onRetry={audit.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState title="No entries match" body="Try a broader search or another group." />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[1000px] text-[14px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[12.5px] text-ink-2">
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Who</th>
                  <th className="px-3 py-2.5 font-medium">What</th>
                  <th className="px-3 py-2.5 font-medium">Person</th>
                  <th className="px-3 py-2.5 font-medium">Detail</th>
                  <th className="px-3 py-2.5 font-medium">Consent used</th>
                  <th className="px-3 py-2.5 pr-5 font-medium">Channel</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 tnum text-ink-2">{fmtDateTime(e.at)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="inline-flex items-center gap-2">
                        <ActorIcon t={e.actor_type} />
                        <span>{e.actor === 'system' ? 'The twin' : e.actor === 'patient' ? 'The person' : e.actor}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span title={e.action} className={cn('font-medium', e.action.includes('escalation') ? 'text-sindoor' : e.action.includes('consent') ? 'text-leaf' : 'text-ink')}>
                        {actionWords(e.action)}
                      </span>
                      {e.object && <span className="block text-[12.5px] tnum text-ink-3">{e.object}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tnum">
                      {e.patient_id ? (
                        <Link to={`/console/patients/${e.patient_id}`} className="text-peacock-deep hover:underline dark:text-peacock">
                          {e.patient_id}
                        </Link>
                      ) : (
                        <span className="text-ink-3">Cohort</span>
                      )}
                    </td>
                    <td className="max-w-[380px] px-3 py-3 text-[13.5px] text-ink-2">
                      <span className="line-clamp-2">{e.detail}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13.5px] text-ink-2">{e.consent_basis ? BASIS[e.consent_basis] ?? e.consent_basis : <span className="text-ink-3">None needed</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 pr-5 text-[13.5px] text-ink-2">{e.channel ? e.channel.toUpperCase() === 'SMS' ? 'SMS' : e.channel.charAt(0).toUpperCase() + e.channel.slice(1) : <span className="text-ink-3">In app</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
