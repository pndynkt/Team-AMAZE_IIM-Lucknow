import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { api } from '@/api/client'
import type { StreamSample, StreamScenario } from '@/api/types'
import { SimulatedTag } from '@/components/ui/Chip'
import { Sparkline } from '@/components/ui/Sparkline'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { fmtTime } from '@/lib/format'
import { cn } from '@/lib/cn'

const KEEP = 14

/** The live wearable stream: the last samples from /api/stream/{id} (synthesised locally in mock mode). */
export function LiveTicker({ id, usual, className }: { id: string; usual?: number; className?: string }) {
  const [samples, setSamples] = useState<StreamSample[]>([])
  const [status, setStatus] = useState<'connecting' | 'open' | 'error'>('connecting')
  const [busy, setBusy] = useState<StreamScenario | null>(null)
  const toast = useToast()
  const reduce = useReducedMotion()
  const closeRef = useRef<() => void>(() => {})

  useEffect(() => {
    setSamples([])
    setStatus('connecting')
    closeRef.current = api.openStream(
      id,
      (s) => setSamples((xs) => [...xs.slice(-(KEEP - 1)), s]),
      (st) => setStatus(st),
    )
    return () => closeRef.current()
  }, [id])

  const inject = async (scenario: StreamScenario) => {
    setBusy(scenario)
    try {
      await api.injectStream(id, scenario)
      toast.info(
        scenario === 'normal' ? 'The stream is back to normal' : scenario === 'acute_tachycardia' ? 'Fast heart rate added to the stream' : 'Slow heart rate added to the stream',
        scenario === 'acute_tachycardia' ? 'Ten samples at 140 bpm or more raise an acute alert and start the ladder.' : undefined,
      )
    } catch (e) {
      toast.error('Could not change the stream', () => inject(scenario), e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const latest = samples[samples.length - 1]
  const high = latest && latest.hr >= 140
  const low = latest && latest.hr <= 50
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            {status === 'open' && !reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-peacock opacity-50" />}
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', status === 'open' ? 'bg-peacock' : status === 'error' ? 'bg-sindoor' : 'bg-stone')} />
          </span>
          <span className="font-medium text-ink">{status === 'open' ? 'Streaming' : status === 'error' ? 'Stream unavailable' : 'Connecting'}</span>
        </div>
        <SimulatedTag />
      </div>
      <div className="flex items-end gap-5">
        <div className="shrink-0">
          <div className={cn('tnum text-[38px] font-semibold leading-none tracking-[-0.04em]', high ? 'text-sindoor' : low ? 'text-turmeric' : 'text-ink')} aria-live="polite">
            {latest ? latest.hr : '--'}
            <span className="ml-1 text-[14px] font-medium tracking-normal text-ink-3">bpm</span>
          </div>
          <div className="mt-1.5 text-[12.5px] tnum text-ink-2">
            {latest ? `at ${fmtTime(latest.t)}${usual ? `, usual ${Math.round(usual)} at rest` : ''}` : status === 'error' ? 'The server stream is not running' : 'Waiting for the first sample'}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {samples.length >= 2 ? (
            <Sparkline values={samples.map((s) => s.hr)} width={200} height={48} color={high ? 'var(--hex-sindoor)' : 'var(--hex-peacock)'} label={`Last ${samples.length} live samples`} className="w-full" />
          ) : (
            <div className="flex h-12 items-center text-[12.5px] text-ink-3">Collecting samples</div>
          )}
        </div>
      </div>
      <div className="border-t border-line pt-3">
        <p className="text-[12.5px] text-ink-2">Add a scenario to the simulated stream</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="secondary" loading={busy === 'acute_tachycardia'} onClick={() => inject('acute_tachycardia')}>
            Fast heart rate
          </Button>
          <Button size="sm" variant="secondary" loading={busy === 'bradycardia'} onClick={() => inject('bradycardia')}>
            Slow heart rate
          </Button>
          <Button size="sm" variant="quiet" loading={busy === 'normal'} onClick={() => inject('normal')}>
            Back to normal
          </Button>
        </div>
        <p className="mt-2 text-[12px] leading-4 text-ink-2">At rest, 140 bpm or more for 10 minutes raises an acute alert for the clinician.</p>
      </div>
    </div>
  )
}
