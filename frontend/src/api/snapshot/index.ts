// A snapshot of the real API, exported by scripts/export_snapshot.py from the trained model.
// The hosted demo has no backend, so the mock client replays these responses (build with
// --mode demo). The cohort list, alerts, audit, model card and Meera's full record ship in
// core.json; every other person's record is fetched from public/demo/patients when first opened.
// Regenerate after retraining: run the API, then python scripts/export_snapshot.py.

import core from './core.json'

export interface SnapshotDetail {
  patient: unknown
  timeline120: unknown
  forecast: unknown
  explain: unknown
  physiology: unknown
  summary: unknown
  me: unknown
  consent: unknown
  intraday: unknown | null
}

export interface SnapshotWhatIf {
  body: { walk_minutes_per_day: number; sleep_extra_hours: number; bp_med_adherence_pct: number | null; sodium_reduction: boolean; alcohol_free: boolean }
  response: unknown
}

export interface Snapshot {
  meta: unknown
  patients: unknown
  alerts: unknown
  thresholds: unknown
  audit: unknown
  model: unknown
  escalations: unknown
  simulate_grid: Record<string, SnapshotWhatIf[]>
  /** People whose FHIR downloads ship with the demo (public/demo/exports). */
  exports: string[]
  /** Records loaded so far, by patient id. Meera (P-0007) is always present. */
  detail: Record<string, SnapshotDetail>
}

type Core = Omit<Snapshot, 'detail'> & { demo_patient: SnapshotDetail }
const { demo_patient, ...rest } = core as unknown as Core

export const snapshot: Snapshot = { ...rest, detail: { 'P-0007': demo_patient } }

const pending: Record<string, Promise<void>> = {}

/** Fetch one person's record the first time it is needed. Unknown ids resolve quietly. */
export function loadDetail(id: string): Promise<void> {
  if (snapshot.detail[id] || !/^P-\d{4}$/.test(id)) return Promise.resolve()
  pending[id] ??= fetch(`${import.meta.env.BASE_URL}demo/patients/${id}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: SnapshotDetail | null) => {
      if (d) snapshot.detail[id] = d
    })
    .catch(() => undefined)
  return pending[id]
}
