import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, CheckCircle2, ChevronDown, PhoneCall, XCircle } from 'lucide-react'
import type { Escalation, EscalationMessage, EscalationStep } from '@/api/types'
import { Glyph } from '@/brand'
import { Button, LinkButton } from '@/components/ui/Button'
import { fmtTime } from '@/lib/format'
import { cn } from '@/lib/cn'

const STEP_TITLE = { user_prompt: 'The person', contact_1: 'First contact', contact_2: 'Second contact', doctor: 'Doctor' }
const STEP_TIMING = { user_prompt: '60 s to answer', contact_1: 'after 60 s', contact_2: '2 min later', doctor: '60-minute reply time' }
const TRIGGER_WORD: Record<Escalation['trigger'], string> = {
  sos: 'SOS held by the person',
  fall: 'Fall reported by the phone',
  caregiver: 'Raised by a caregiver',
  acute: 'Live heart rate above 140 bpm',
  clinician: 'Started by the clinician',
}

export function stepIndex(state: Escalation['state']): number {
  return ['user_prompt', 'contact_1', 'contact_2', 'doctor'].indexOf(state) + 1
}

/** Short status for banners: "step 2 of 4, reaching the first contact". */
export function escalationShort(es: Escalation): string {
  if (es.state === 'resolved') return 'resolved'
  if (es.state === 'cancelled') return 'closed as a false alarm'
  const what = { user_prompt: 'waiting for the person to answer', contact_1: 'reaching the first contact', contact_2: 'reaching the second contact', doctor: 'waiting for the doctor' }[es.state]
  return `step ${stepIndex(es.state)} of 4, ${what}`
}

export function escalationHeadline(es: Escalation): string {
  if (es.state === 'resolved') return es.outcome === 'im_ok' ? 'Resolved. The person said they are OK.' : 'Resolved'
  if (es.state === 'cancelled') return 'Closed as a false alarm'
  return `Escalation in progress, step ${stepIndex(es.state)} of 4`
}

/** "Arjun Iyer: push + SMS ..." gives "Arjun Iyer". */
function contactName(step: EscalationStep): string | null {
  if (step.state !== 'contact_1' && step.state !== 'contact_2') return null
  const m = step.detail.match(/^([^:]{2,40}):/)
  return m ? m[1] : null
}

/** Drops the repeated contact name and turns "push + SMS + voice" into a plain list. */
function plainDetail(detail: string, name: string | null): string {
  let d = name && detail.startsWith(`${name}:`) ? detail.slice(name.length + 1).trim() : detail
  d = d.replace(/\s\+\s/g, ', ')
  return d.charAt(0).toUpperCase() + d.slice(1)
}

export interface EscalationLadderProps {
  escalation: Escalation
  /** Who is viewing: changes the available actions and copy. */
  viewer: 'clinician' | 'patient'
  onRespond?: (action: 'resolved' | 'false_alarm' | 'im_ok' | 'acknowledged') => void | Promise<void>
  busy?: boolean
  compact?: boolean
  className?: string
  /** Hide the built-in action row (the patient view renders its own pinned bar). */
  hideActions?: boolean
}

/** The check-in ladder, rendered from the live escalation state. */
export function EscalationLadder({ escalation: es, viewer, onRespond, busy, compact, className, hideActions }: EscalationLadderProps) {
  const reduce = useReducedMotion()
  const active = es.state !== 'resolved' && es.state !== 'cancelled'
  const currentIdx = active ? stepIndex(es.state) : 5
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          {active ? (
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sindoor opacity-50" />}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sindoor" />
            </span>
          ) : es.state === 'resolved' ? (
            <CheckCircle2 className="h-4 w-4 text-leaf" aria-hidden />
          ) : (
            <XCircle className="h-4 w-4 text-ink-3" aria-hidden />
          )}
          <p className="text-[15px] font-semibold" aria-live="polite">
            {escalationHeadline(es)}
          </p>
        </div>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          <div className="flex gap-1">
            <dt className="text-ink-3">Started</dt>
            <dd className="tnum">{fmtTime(es.started_at)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">Trigger</dt>
            <dd>{TRIGGER_WORD[es.trigger]}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">Reference</dt>
            <dd className="tnum text-ink-3">{es.id}</dd>
          </div>
        </dl>
      </div>

      <ol className="relative" aria-label="Check-in ladder steps">
        {es.steps.map((step, i) => (
          <LadderStep key={step.n} step={step} status={statusOf(step, es, currentIdx)} compact={compact} last={i === es.steps.length - 1} />
        ))}
      </ol>

      {es.location && (
        <p className="text-[12.5px] text-ink-2">
          Location shared with contacts: <span className="tnum">{es.location.lat.toFixed(3)}, {es.location.lng.toFixed(3)}</span>, within {es.location.accuracy_m} m
        </p>
      )}

      {!hideActions && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <LinkButton href={es.actions.call_112_url} variant="danger" size="md" icon={<PhoneCall />}>
            Call 112
          </LinkButton>
          <LinkButton href={es.actions.uhi_ambulance_url} variant="secondary" size="md" external>
            Book a UHI ambulance
          </LinkButton>
          {active && onRespond && viewer === 'patient' && (
            <Button variant="primary" size="md" loading={busy} onClick={() => void onRespond('im_ok')} icon={<Check />}>
              I'm OK
            </Button>
          )}
          {active && onRespond && (
            <>
              <Button variant="secondary" size="md" loading={busy} onClick={() => void onRespond('resolved')} icon={<CheckCircle2 />}>
                Mark resolved
              </Button>
              <Button variant="quiet" size="md" loading={busy} onClick={() => void onRespond('false_alarm')}>
                Close as false alarm
              </Button>
            </>
          )}
          {es.actions.mock && <span className="ml-auto text-[12px] text-ink-2">Messages are mock-ups. Nothing is sent.</span>}
        </div>
      )}
    </div>
  )
}

type VisualStatus = 'done' | 'skipped' | 'current' | 'pending' | 'no_response' | 'acknowledged'

function statusOf(step: EscalationStep, es: Escalation, currentIdx: number): VisualStatus {
  if (step.status === 'skipped') return 'skipped'
  if (step.status === 'acknowledged') return 'acknowledged'
  if (step.n < currentIdx) return step.status === 'no_response' ? 'no_response' : 'done'
  if (step.n === currentIdx && es.state !== 'resolved' && es.state !== 'cancelled') return 'current'
  if (es.state === 'resolved' || es.state === 'cancelled') return step.status === 'sent' || step.status === 'no_response' ? 'done' : 'skipped'
  return 'pending'
}

const STATUS_WORD: Record<VisualStatus, string> = {
  current: 'In progress',
  no_response: 'No answer',
  acknowledged: 'Answered',
  done: 'Sent',
  skipped: 'Skipped',
  pending: 'Waiting',
}

function LadderStep({ step, status, compact, last }: { step: EscalationStep; status: VisualStatus; compact?: boolean; last: boolean }) {
  const [open, setOpen] = useState(status === 'current' && !compact)
  const hasMessages = (step.messages?.length ?? 0) > 0
  const name = contactName(step)
  return (
    <li className="relative flex gap-3.5 pb-4 last:pb-0">
      {!last && <span className="absolute left-[15px] top-9 bottom-1 w-px bg-line" aria-hidden />}
      <span
        className={cn(
          'relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tnum',
          status === 'current' && 'bg-sindoor-solid text-white',
          (status === 'done' || status === 'acknowledged') && 'bg-leaf-soft text-leaf',
          status === 'no_response' && 'bg-stone-soft text-ink-2',
          (status === 'pending' || status === 'skipped') && 'border border-line-strong bg-surface text-ink-3',
        )}
        aria-hidden
      >
        {status === 'done' || status === 'acknowledged' ? <Check className="h-4 w-4" strokeWidth={2.4} /> : step.n}
      </span>
      <div className={cn('min-w-0 flex-1 pt-1', status === 'pending' && 'opacity-70')}>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-[14px] font-semibold">
            {STEP_TITLE[step.state]}
            {name && <span className="font-normal text-ink-2">, {name}</span>}
          </span>
          <span className="text-[12.5px] text-ink-3">{STEP_TIMING[step.state]}</span>
          <span className={cn('text-[12.5px] font-medium', status === 'current' ? 'text-sindoor' : status === 'done' || status === 'acknowledged' ? 'text-leaf' : 'text-ink-2')}>{STATUS_WORD[status]}</span>
          {status !== 'pending' && <span className="ml-auto text-[12px] tnum text-ink-3">{fmtTime(step.at)}</span>}
        </div>
        {(!compact || status === 'current') && <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{plainDetail(step.detail, name)}</p>}
        {hasMessages && !compact && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 rounded-[8px] text-[13px] font-medium text-peacock-deep hover:underline dark:text-peacock">
            {open ? 'Hide the messages' : `Show the ${step.messages!.length} messages`}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        )}
        <AnimatePresence initial={false}>
          {hasMessages && open && !compact && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="overflow-hidden">
              <div className="grid gap-3 pt-3 lg:grid-cols-3">
                {step.messages!.map((m, i) => (
                  <MessageMock key={i} m={m} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  )
}

/** SMS with the -S service header, WhatsApp utility template and voice script, typeset as the contact sees them. */
export function MessageMock({ m }: { m: EscalationMessage }) {
  if (m.channel === 'sms') {
    return (
      <figure className="rounded-block border border-line bg-surface-2 p-3.5">
        <figcaption className="mb-2.5 flex items-center justify-between gap-2 text-[12px] text-ink-2">
          <span className="font-semibold text-ink">SMS</span>
          <span className="tnum">to {m.to}</span>
        </figcaption>
        <p className="mb-1.5 text-[12px] text-ink-2">
          Sender <span className="font-semibold tnum text-ink">{m.header}</span>
        </p>
        <div className="rounded-[14px] rounded-tl-[4px] bg-surface p-3 text-[13px] leading-[1.5] text-ink shadow-[0_1px_1px_rgba(16,48,47,0.06)]">{m.body}</div>
        <p className="mt-2.5 text-[11.5px] leading-4 text-ink-2">Template {m.template_id}. The -S header marks a service message under the TRAI rules.</p>
      </figure>
    )
  }
  if (m.channel === 'whatsapp') {
    return (
      <figure className="rounded-block border border-line bg-leaf-soft/60 p-3.5">
        <figcaption className="mb-2.5 flex items-center justify-between gap-2 text-[12px] text-ink-2">
          <span className="font-semibold text-ink">WhatsApp</span>
          {m.to && <span className="tnum">to {m.to}</span>}
        </figcaption>
        <div className="rounded-[14px] rounded-tl-[4px] bg-surface p-3 text-[13px] leading-[1.5] shadow-[0_1px_1px_rgba(16,48,47,0.06)]">
          <p className="font-semibold text-ink">Pratibimb check-in</p>
          <p className="mt-1 text-ink-2">A health check-in has not been answered. Please call now, or call 112 if you cannot reach them.</p>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-line pt-2.5">
            <span className="text-center text-[12.5px] font-semibold text-leaf">Call now</span>
            <span className="text-center text-[12.5px] font-semibold text-leaf">Call 112</span>
          </div>
        </div>
        <p className="mt-2.5 text-[11.5px] leading-4 text-ink-2">Utility template {m.template}</p>
      </figure>
    )
  }
  if (m.channel === 'voice') {
    return (
      <figure className="rounded-block border border-line bg-peacock-soft/50 p-3.5">
        <figcaption className="mb-2.5 flex items-center justify-between gap-2 text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <Glyph name="ladder" size={14} tone="current" className="text-peacock" /> Voice call
          </span>
          <span className="tnum">from {m.from}</span>
        </figcaption>
        <blockquote className="rounded-[14px] bg-surface p-3 text-[13px] leading-[1.55] text-ink shadow-[0_1px_1px_rgba(16,48,47,0.06)]">{m.script}</blockquote>
        <p className="mt-2.5 text-[11.5px] leading-4 text-ink-2">Read by a recorded voice. 1600-series numbers are for transactional calls.</p>
      </figure>
    )
  }
  return (
    <figure className="rounded-block border border-line bg-surface-2 p-3.5 text-[13px]">
      <figcaption className="mb-1 text-[12px] font-semibold">Push notification</figcaption>
      <p className="font-semibold">{m.title ?? 'Pratibimb'}</p>
      {m.body && <p className="text-ink-2">{m.body}</p>}
    </figure>
  )
}
