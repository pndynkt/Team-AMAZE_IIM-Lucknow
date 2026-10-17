import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, PhoneCall, X } from 'lucide-react'
import { api } from '@/api/client'
import { usePoll } from '@/api/hooks'
import type { Escalation, EscalationLocation } from '@/api/types'
import { CountdownRing } from '@/components/ui/CountdownRing'
import { Button, LinkButton } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { EscalationLadder } from '@/components/domain/EscalationLadder'
import { useLang } from '@/i18n'
import { useMeta } from '@/lib/meta'
import { cn } from '@/lib/cn'

const HOLD_MS = 1500
const DEMO_COUNTDOWN_S = 60
const FALLBACK_LOCATION: EscalationLocation = { lat: 12.97, lng: 77.59, accuracy_m: 25 }

type Phase = 'idle' | 'countdown' | 'starting' | 'ladder'

export interface SosFlowProps {
  patientId: string
  /** An escalation already active for this person (for example after a refresh). */
  existing: Escalation | null
  onEscalationChange?: (es: Escalation | null) => void
  /** Element the full-screen overlays are portaled into (the phone frame). */
  container?: HTMLElement | null
}

/** Press-and-hold SOS, a full-screen 60 second check, then the live ladder. */
export function SosFlow({ patientId, existing, onEscalationChange, container }: SosFlowProps) {
  const { t, lang } = useLang()
  const { meta } = useMeta()
  const toast = useToast()
  const reduce = useReducedMotion()
  const hi = lang === 'hi'
  const [phase, setPhase] = useState<Phase>(existing ? 'ladder' : 'idle')
  const [escalationId, setEscalationId] = useState<string | null>(existing?.id ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (existing && phase === 'idle') {
      setEscalationId(existing.id)
      setPhase('ladder')
    }
  }, [existing, phase])

  // Hold-to-start ring
  const [hold, setHold] = useState(0)
  const holdStart = useRef<number | null>(null)
  const raf = useRef<number>(0)
  const tick = useCallback((now: number) => {
    if (holdStart.current === null) return
    const p = Math.min(1, (now - holdStart.current) / HOLD_MS)
    setHold(p)
    if (p >= 1) {
      holdStart.current = null
      setHold(0)
      setPhase('countdown')
      try {
        navigator.vibrate?.([120, 60, 120])
      } catch {
        /* vibration not supported */
      }
      return
    }
    raf.current = requestAnimationFrame(tick)
  }, [])
  const startHold = () => {
    if (phase !== 'idle') return
    holdStart.current = performance.now()
    raf.current = requestAnimationFrame(tick)
  }
  const cancelHold = () => {
    holdStart.current = null
    cancelAnimationFrame(raf.current)
    setHold(0)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // Countdown on the demo clock: 60 demo seconds take 60 / demo_speed real seconds.
  const realMs = (DEMO_COUNTDOWN_S / Math.max(1, meta.demo_speed)) * 1000
  const [remaining, setRemaining] = useState(DEMO_COUNTDOWN_S)
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    if (phase !== 'countdown') return
    const start = performance.now()
    setRemaining(DEMO_COUNTDOWN_S)
    setAnnounce(`${t.countdown_title} ${DEMO_COUNTDOWN_S} ${t.seconds}`)
    let id = 0
    const loop = (now: number) => {
      const elapsed = now - start
      const left = Math.max(0, DEMO_COUNTDOWN_S - (elapsed / realMs) * DEMO_COUNTDOWN_S)
      setRemaining(left)
      if (left <= 0) {
        setPhase('starting')
        return
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    const announcer = window.setInterval(
      () =>
        setRemaining((r) => {
          setAnnounce(`${Math.ceil(r)} ${t.seconds}`)
          return r
        }),
      realMs / 3,
    )
    return () => {
      cancelAnimationFrame(id)
      window.clearInterval(announcer)
    }
  }, [phase, realMs, t.countdown_title, t.seconds])

  // On expiry: a quick location, then POST /api/escalations.
  useEffect(() => {
    if (phase !== 'starting') return
    let cancelled = false
    const getLocation = () =>
      new Promise<EscalationLocation>((resolve) => {
        if (!('geolocation' in navigator)) return resolve(FALLBACK_LOCATION)
        const timer = window.setTimeout(() => resolve(FALLBACK_LOCATION), 1500)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            window.clearTimeout(timer)
            resolve({ lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000, accuracy_m: Math.round(pos.coords.accuracy) })
          },
          () => {
            window.clearTimeout(timer)
            resolve(FALLBACK_LOCATION)
          },
          { timeout: 1200, maximumAge: 60000 },
        )
      })
    ;(async () => {
      const location = await getLocation()
      try {
        const es = await api.createEscalation({ patient_id: patientId, trigger: 'sos', by: 'patient', alert_id: null, location })
        if (cancelled) return
        setEscalationId(es.id)
        setPhase('ladder')
        onEscalationChange?.(es)
      } catch (e) {
        if (cancelled) return
        toast.error('Could not reach the server to call your contacts', () => setPhase('starting'), e instanceof Error ? e.message : undefined)
        setPhase('idle')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, patientId])

  // Live ladder: poll every 2 s while it runs.
  const live = usePoll(() => api.escalation(escalationId!), 2000, phase === 'ladder' && !!escalationId, [escalationId])
  const es = live.data ?? existing
  const active = !!es && es.state !== 'resolved' && es.state !== 'cancelled'
  useEffect(() => {
    if (es) onEscalationChange?.(active ? es : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [es?.state])

  const respond = async (action: 'im_ok' | 'resolved' | 'false_alarm' | 'acknowledged') => {
    if (!escalationId) return
    setBusy(true)
    try {
      const next = await api.respondEscalation(escalationId, { by: 'patient', action })
      live.setData(next)
      toast.success(action === 'im_ok' ? 'Thank you. Your contacts know you are OK.' : action === 'false_alarm' ? 'Closed as a false alarm.' : 'Marked as resolved.')
    } catch (e) {
      toast.error('Could not send your answer', () => respond(action), e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setPhase('idle')
    setEscalationId(null)
    onEscalationChange?.(null)
  }

  const progress = remaining / DEMO_COUNTDOWN_S
  const secondsLabel = Math.ceil(remaining)

  return (
    <>
      <div className="flex items-center gap-5">
        <button
          type="button"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (holdStart.current === null) startHold()
            }
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter' || e.key === ' ') cancelHold()
          }}
          aria-label={`${t.sos}. ${t.sos_hold}`}
          disabled={phase !== 'idle'}
          className="relative flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-peacock/50 disabled:opacity-60"
          style={{ touchAction: 'none' }}
        >
          <CountdownRing progress={hold} size={112} stroke={7} color="var(--hex-sindoor)" track="var(--hex-mist-deep)" smooth={false}>
            <span className={cn('flex h-[90px] w-[90px] items-center justify-center rounded-full bg-sindoor-solid text-white shadow-[0_12px_26px_-12px_rgba(176,58,35,0.75)] transition-transform', hold > 0 && !reduce && 'scale-95')}>
              <span className="text-[22px] font-650 tracking-[-0.01em]">{t.sos}</span>
            </span>
          </CountdownRing>
        </button>
        <div className="min-w-0">
          <h2 className={cn('text-[17px] font-semibold text-ink', hi && 'font-devanagari')}>{t.sos_title}</h2>
          <p className={cn('mt-0.5 text-[14px] leading-5 text-ink-2', hi && 'font-devanagari')} aria-live="polite">
            {hold > 0 ? t.sos_holding : t.sos_hold}
          </p>
          <a href="tel:112" className={cn('mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-sindoor', hi && 'font-devanagari')}>
            <PhoneCall className="h-4 w-4" aria-hidden /> {t.call_112}
          </a>
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {(phase === 'countdown' || phase === 'starting') && (
            <motion.div
              key="countdown"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="sos-title"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(container ? 'absolute' : 'fixed', 'inset-0 z-[70] flex flex-col items-center justify-center bg-sindoor-solid px-6 text-center text-white')}
            >
              <p className="sr-only" aria-live="assertive">
                {announce}
              </p>
              <h2 id="sos-title" className={cn('text-[32px] font-650 tracking-[-0.02em]', hi && 'font-devanagari')}>
                {t.countdown_title}
              </h2>
              <p className={cn('mt-2 max-w-xs text-[16px] leading-6 text-white/90', hi && 'font-devanagari')}>{t.countdown_body}</p>
              <div className="my-9">
                <CountdownRing progress={progress} size={220} stroke={11} color="#FFFFFF" track="rgba(255,255,255,0.25)" smooth={false}>
                  <div>
                    <div className="tnum text-[76px] font-650 leading-none tracking-[-0.05em]">{phase === 'starting' ? 0 : secondsLabel}</div>
                    <div className={cn('mt-1 text-[15px] text-white/85', hi && 'font-devanagari')}>{t.seconds}</div>
                  </div>
                </CountdownRing>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={phase === 'starting'}
                className={cn('inline-flex h-16 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-white text-[22px] font-semibold text-sindoor shadow-[0_18px_40px_-14px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98] disabled:opacity-60', hi && 'font-devanagari')}
                autoFocus
              >
                <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden /> {t.im_ok}
              </button>
              <a href="tel:112" className={cn('mt-4 inline-flex h-12 items-center gap-2 rounded-full px-5 text-[16px] font-semibold text-white hover:bg-white/15', hi && 'font-devanagari')}>
                <PhoneCall className="h-5 w-5" aria-hidden /> {t.call_112}
              </a>
              <p className={cn('mt-6 text-[13px] text-white/80', hi && 'font-devanagari')}>{phase === 'starting' ? t.ladder_title : t.demo_clock(meta.demo_speed)}</p>
            </motion.div>
          )}

          {phase === 'ladder' && es && (
            <motion.div key="ladder" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className={cn(container ? 'absolute' : 'fixed', 'inset-0 z-[70] flex flex-col bg-mist')}>
              <div className={cn('flex items-center justify-between px-5 pb-4 pt-6', active ? 'bg-sindoor-soft' : 'bg-leaf-soft')}>
                <h2 className={cn('text-[20px] font-650 tracking-[-0.01em]', hi && 'font-devanagari')}>{active ? t.ladder_title : t.resolved}</h2>
                {!active && (
                  <Button variant="quiet" size="sm" onClick={close} icon={<X />}>
                    Close
                  </Button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 scrollbar-thin">
                <EscalationLadder escalation={es} viewer="patient" compact hideActions />
                {!active && (
                  <div className="mt-5 rounded-block bg-surface p-4 text-[14.5px] leading-6 text-ink-2">
                    {es.outcome === 'im_ok' ? 'You said you are OK. Your contacts and your doctor have been told.' : es.state === 'cancelled' ? 'This was closed as a false alarm. Nothing else happens.' : 'This has been resolved. Your doctor can see the full record.'}
                  </div>
                )}
                {es.actions.mock && <p className="mt-4 text-[13px] text-ink-2">Messages are mock-ups. Nothing is sent.</p>}
              </div>
              {active && (
                <div className="border-t border-line bg-surface px-4 pb-5 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <LinkButton href={es.actions.call_112_url} variant="danger" size="lg" icon={<PhoneCall />} className={cn('h-14 text-[16px]', hi && 'font-devanagari')}>
                      {t.call_112}
                    </LinkButton>
                    <Button variant="primary" size="lg" loading={busy} onClick={() => void respond('im_ok')} icon={<Check />} className={cn('h-14 text-[16px]', hi && 'font-devanagari')}>
                      {t.im_ok}
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                    <LinkButton href={es.actions.uhi_ambulance_url} variant="quiet" size="sm" external className={cn(hi && 'font-devanagari')}>
                      {t.uhi_ambulance}
                    </LinkButton>
                    <Button variant="quiet" size="sm" loading={busy} onClick={() => void respond('false_alarm')} className={cn(hi && 'font-devanagari')}>
                      {t.false_alarm}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        container ?? document.body,
      )}
    </>
  )
}
