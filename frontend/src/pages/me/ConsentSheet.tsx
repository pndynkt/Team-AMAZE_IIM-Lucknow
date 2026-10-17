import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Glyph } from '@/brand'
import { api } from '@/api/client'
import type { Consent } from '@/api/types'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/i18n'
import { cn } from '@/lib/cn'

type Key = 'ehr' | 'wearable' | 'ai_predictions' | 'emergency_contacts'

export function ConsentSheet({ open, onClose, patientId, container, onChanged }: { open: boolean; onClose: () => void; patientId: string; container: HTMLElement | null; onChanged: () => void }) {
  const { t, lang } = useLang()
  const toast = useToast()
  const [consent, setConsent] = useState<Consent | null>(null)
  const [busy, setBusy] = useState<Key | 'withdraw' | null>(null)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const hi = lang === 'hi'

  useEffect(() => {
    if (!open) return
    let alive = true
    api
      .consent(patientId)
      .then((c) => alive && setConsent(c))
      .catch((e) => toast.error('Could not load consent', undefined, e instanceof Error ? e.message : undefined))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId])

  const toggle = async (key: Key) => {
    if (!consent) return
    const next = !consent[key]
    setBusy(key)
    try {
      const updated = await api.updateConsent(patientId, { [key]: next })
      setConsent(updated)
      onChanged()
      toast.success(next ? 'Permission given' : 'Permission turned off', key === 'ai_predictions' && !next ? 'Your score is hidden from now on. Your doctor still sees your readings.' : undefined)
    } catch (e) {
      toast.error('Could not update consent', () => toggle(key), e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const withdraw = async () => {
    setBusy('withdraw')
    try {
      const updated = await api.updateConsent(patientId, { wearable: false, ai_predictions: false, withdraw: true })
      setConsent(updated)
      setConfirmWithdraw(false)
      onChanged()
      toast.success('Watch data deleted', 'In this demo the rows are hidden and an audit entry is written.')
    } catch (e) {
      toast.error('Could not withdraw', withdraw, e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const items: { key: Key; label: string; body: string }[] = [
    { key: 'ehr', label: t.consent_ehr, body: hi ? 'निदान, दवाएँ और जाँच रिपोर्ट' : 'Conditions, medicines and lab results from your records' },
    { key: 'wearable', label: t.consent_wearable, body: hi ? 'हृदय गति, नींद, कदम, घर का BP' : 'Heart rate, sleep, steps and home BP from your watch' },
    { key: 'ai_predictions', label: t.consent_ai, body: hi ? 'बंद करने पर स्कोर छिप जाएगा' : 'Turning this off hides your score for you and your doctor' },
    { key: 'emergency_contacts', label: t.consent_contacts, body: hi ? 'SOS पर संपर्कों को संदेश' : 'Messages to your contacts only when you press SOS or do not respond' },
  ]

  return (
    <Sheet open={open} onClose={onClose} side="bottom" container={container} title={<span className={cn('inline-flex items-center gap-2', hi && 'font-devanagari')}><Glyph name="consent" size={20} tone="current" className="text-leaf" /> {t.consent}</span>} description={hi ? 'हर अनुमति अलग है। किसी एक को बंद करने से बाकी पर असर नहीं पड़ता।' : 'Each permission is separate. Turning one off does not affect the others.'}>
      <ul className="space-y-2">
        {items.map((it) => {
          const on = consent?.[it.key] ?? false
          return (
            <li key={it.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={!consent || busy !== null}
                onClick={() => toggle(it.key)}
                className="flex w-full items-center justify-between gap-3 rounded-block border border-line bg-surface-2 px-4 py-3.5 text-left disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className={cn('block text-[15px] font-semibold', hi && 'font-devanagari')}>{it.label}</span>
                  <span className={cn('block text-[13px] leading-5 text-ink-2', hi && 'font-devanagari')}>{it.body}</span>
                </span>
                <span className={cn('relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-leaf' : 'bg-mist-deep')} aria-hidden>
                  <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow-[0_1px_3px_rgba(16,48,47,0.25)] transition-transform', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 rounded-block bg-sindoor-soft/60 p-4">
        {!confirmWithdraw ? (
          <button type="button" onClick={() => setConfirmWithdraw(true)} className={cn('text-[14px] font-semibold text-sindoor underline-offset-2 hover:underline', hi && 'font-devanagari')}>
            {t.withdraw}
          </button>
        ) : (
          <div>
            <p className={cn('flex items-start gap-2 text-[14px] leading-5 text-ink', hi && 'font-devanagari')}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sindoor" aria-hidden />
              {hi ? 'इससे आपकी घड़ी का सारा डेटा हट जाएगा और पूर्वानुमान बंद हो जाएँगे।' : 'This deletes all your watch data and switches predictions off. Your doctor keeps the clinical record.'}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" size="sm" loading={busy === 'withdraw'} onClick={withdraw}>
                {hi ? 'हाँ, हटाएँ' : 'Yes, delete'}
              </Button>
              <Button variant="quiet" size="sm" onClick={() => setConfirmWithdraw(false)}>
                {hi ? 'रद्द करें' : 'Cancel'}
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className={cn('mt-4 text-[13px] leading-5 text-ink-2', hi && 'font-devanagari')}>{t.grievance}</p>
    </Sheet>
  )
}
