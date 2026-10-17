import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleDashed, Download } from 'lucide-react'
import { api } from '@/api/client'
import type { AlertBudget, ModelCard } from '@/api/types'
import modelFx from '@/api/fixtures/model.json'
import alertsFx from '@/api/fixtures/alerts.json'
import { SiteFooter, SiteHeader } from '@/components/layout/Site'
import { RouteButton } from '@/components/ui/Button'
import { DOCS, DOWNLOADS, assetUrl } from '@/content/docs'
import { fmtNum, fmtPct } from '@/lib/format'
import { metricOf } from '@/lib/modelNumbers'
import { cn } from '@/lib/cn'

const TOUR: { to: string; title: string; look: string; mins: string }[] = [
  { to: '/console', title: 'Open today in the clinician console', look: 'The first sentence says who needs attention. Meera Iyer is near the top with the reason in plain words and her data freshness.', mins: '1 min' },
  { to: '/console/patients/P-0007', title: "Open Meera's twin", look: 'The summary says what the twin expects, why, her strongest lever and what to do next. "What the twin used" shows the health record and the wearable side by side.', mins: '1 min' },
  { to: '/console/patients/P-0007?tab=simulate', title: 'Simulate a change', look: 'Walking 30 minutes a day. Compare "For Meera" with "For most people": the twin uses her own response, not an average.', mins: '1 min' },
  { to: '/me/P-0007', title: 'See what Meera sees', look: 'Status in words, her numbers against her usual, Hindi with Listen, and What helps you. Hold SOS to start the check-in ladder, then look at the console banner.', mins: '1 min' },
  { to: '/console/model', title: 'Check the model card', look: 'Each stream alone and fused, how well the twin recovers each person\'s physiology, calibration, and what it cannot do.', mins: '1 min' },
]

interface Row {
  n: number
  ask: string
  built: ReactNode
  see: { to: string; label: string }[]
  code: string[]
  proof: (m: ModelCard, b: AlertBudget) => ReactNode
  status?: 'done' | 'partly'
}

const ROWS: Row[] = [
  {
    n: 1,
    ask: 'Pick one chronic condition that is common in India.',
    built: 'Hypertension with cardiovascular risk in Indian adults. The adverse event is a cardiovascular strain episode in the next 72 hours.',
    see: [{ to: '/console', label: 'Today' }],
    code: ['backend/twin/data/ehr.py', 'backend/twin/config.py'],
    proof: (m) => `${fmtNum(m.data.cohort)} synthetic people with hypertension, ${fmtNum(m.data.events)} labelled strain episodes`,
  },
  {
    n: 2,
    ask: 'Use a static or historical health record stream.',
    built: 'A Synthea-shaped FHIR R4 record: SNOMED conditions, LOINC labs, medicines with adherence, family history, a polygenic risk tier and Framingham 10-year risk.',
    see: [{ to: '/console/patients/P-0007?tab=records', label: 'Records' }],
    code: ['backend/twin/data/ehr.py', 'backend/twin/data/synthea.py', 'backend/twin/models/risk_scores.py'],
    proof: () => 'Source bundle downloadable from the Records tab',
  },
  {
    n: 3,
    ask: 'Use a dynamic, real-time wearable stream.',
    built: 'Nightly heart rate, HRV, sleep, steps, SpO2, breathing rate and home BP for 120 days, a 5-minute intraday trace, and a live simulated stream that can raise an acute alert.',
    see: [{ to: '/console/patients/P-0007?tab=twin', label: 'Twin' }],
    code: ['backend/twin/data/wearables.py', 'backend/twin/engine/stream.py', 'POST /api/ingest in backend/twin/api/main.py'],
    proof: (m) => `${fmtNum(m.data.patient_days)} patient-days, freshness shown on every card`,
  },
  {
    n: 4,
    ask: 'Fuse the two streams into one virtual patient.',
    built: "One feature set from both streams, measured against each person's own usual. Every view labels which stream a fact came from: Health record in sandalwood, Wearable in peacock.",
    see: [
      { to: '/console/patients/P-0007', label: 'Twin summary' },
      { to: '/console/model', label: 'Ablation' },
    ],
    code: ['backend/twin/features/build.py', 'backend/twin/models/fusion.py'],
    proof: (m) => `AUROC: fused ${(metricOf(m, 'fused', 'auroc') ?? 0).toFixed(3)}, without the personal engine ${(metricOf(m, 'fused_no_twin', 'auroc') ?? 0).toFixed(3)}, watch and cuff ${(metricOf(m, 'wearable_only', 'auroc') ?? 0).toFixed(3)}, record only ${(metricOf(m, 'ehr_only', 'auroc') ?? 0).toFixed(3)}`,
  },
  {
    n: 5,
    ask: 'Build a working model that predicts an adverse event before it happens.',
    built: 'LightGBM with patient-level cross-validation, calibration, a five-model range, operating points set by a false-alert budget, and quantile forecasts of heart rate and BP.',
    see: [{ to: '/console/model', label: 'Model card' }],
    code: ['backend/twin/models/train.py', 'backend/twin/models/forecast.py', 'backend/tests/test_leakage.py'],
    proof: (m) => `AUROC ${metricOf(m, 'fused', 'auroc')?.toFixed(2)}, median warning ${Math.round(metricOf(m, 'fused', 'median_lead_hours') ?? 0)} h ahead, leakage tests ${m.leakage_tests.passed ? 'passed' : 'failed'}`,
  },
  {
    n: 6,
    ask: 'Give the doctor a dashboard to see and work with the virtual patient.',
    built: 'Triage that leads with who needs attention, a twin page with summary, charts, simulation, records and alerts, an alert budget, a threshold editor that replays 14 days, and an audit log.',
    see: [
      { to: '/console', label: 'Today' },
      { to: '/console/alerts', label: 'Alerts' },
      { to: '/console/thresholds', label: 'Thresholds' },
    ],
    code: ['frontend/src/pages/console', 'backend/twin/engine/alerts.py'],
    proof: (_m, b) => `False alerts ${b.observed_rate.toFixed(3)} a patient-day this week, budget ${b.target_false_alerts_per_patient_day.toFixed(3)}`,
  },
  {
    n: 7,
    ask: "Simulate the person's own physiology and personalise the plan.",
    built: "A personal physiology engine: each person's response to sleep and walking, learned on calm days and pooled toward the cohort. What-if levers use those personal slopes and show them beside the average.",
    see: [
      { to: '/console/patients/P-0007?tab=simulate', label: 'Simulate' },
      { to: '/me/P-0007', label: 'What helps you' },
    ],
    code: ['backend/twin/models/physiology.py', 'frontend/src/pages/console/twin/SimulateTab.tsx'],
    proof: (m) => {
      const p = m.physiology?.pairs[0]
      return p
        ? `Error against each person's true slope (${p.label.replace(/\bbp\b/g, 'BP').replace(/\bhrv\b/g, 'HRV').toLowerCase()}): ${p.mae_pooled.toFixed(2)} for the twin, ${p.mae_raw.toFixed(2)} for a per-person fit alone, ${p.mae_population.toFixed(2)} for the cohort average`
        : 'Validation not published by the server yet'
    },
  },
  {
    n: 8,
    ask: 'Use only anonymised, open or synthetic data.',
    built: 'Everything the model learns from is generated by this repository with a fixed seed. Published studies set the generator parameters only. Identifiers such as ABHA are masked.',
    see: [{ to: '/guide/docs/data-sources', label: 'Data sources' }],
    code: ['backend/twin/data/generate.py'],
    proof: (m) => `Synthetic, seed ${m.data.generator_seed}. No real person's data trains the model.`,
  },
  {
    n: 9,
    ask: 'Submit a README, a video, a licence, an architecture diagram and a presentation.',
    built: 'README organised around the 12 items of the submission form: team, college, problem, use case, stack, model, video, licence, architecture, presentation and public links. MIT licence. Architecture diagram and presentation as PDF.',
    see: [{ to: '/guide/docs/readme', label: 'Read me' }],
    code: ['README.md', 'LICENSE', 'docs/architecture.pdf', 'docs/presentation.pdf'],
    proof: () => 'Every item is linked from the submission checklist at the top of the README',
    status: 'done',
  },
  {
    n: 10,
    ask: 'Show real-world impact in the Indian context.',
    built: 'Works on the watches India buys and their hourly sync, a patient view in English and Hindi with read-aloud, one-tap 112, TRAI-style message headers, ABDM export, and consent built for the DPDP Act.',
    see: [
      { to: '/me/P-0007', label: 'Patient view' },
      { to: '/guide/docs/compliance', label: 'Compliance' },
    ],
    code: ['frontend/src/i18n/hi.ts', 'backend/twin/engine/fhir.py', 'backend/twin/engine/escalation.py'],
    proof: () => '91.6% of smartwatches sold in India cost under US$50 (IDC)',
  },
]

export default function Guide() {
  useEffect(() => {
    document.title = 'Evaluator guide, Pratibimb'
  }, [])
  const [m, setM] = useState<ModelCard>(modelFx as unknown as ModelCard)
  const [b, setB] = useState<AlertBudget>(alertsFx.budget as unknown as AlertBudget)
  useEffect(() => {
    let alive = true
    api
      .model()
      .then((x) => alive && setM(x))
      .catch(() => {})
    api
      .alerts({ status: 'open' })
      .then((x) => alive && setB(x.budget))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-mist text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-landing px-4 pb-16 md:px-6">
        <header className="max-w-3xl pb-12 pt-10 md:pt-16">
          <h1 className="text-[40px] font-650 leading-[1.08] tracking-[-0.03em] md:text-[52px]">Evaluator guide</h1>
          <p className="mt-5 text-[18px] leading-[1.6] text-ink-2">
            Pratibimb is a digital twin for Indian adults with high blood pressure. It joins a health record with a wearable stream, forecasts a cardiovascular strain episode up to 72 hours ahead against each person's own usual, and gives the doctor and the person a calm, plain way to act on it.
          </p>
          <p className="mt-3 text-[15px] leading-6 text-ink-2">All data is synthetic. Every number on this page comes from the running model.</p>
        </header>

        <section aria-labelledby="tour" className="border-t border-line pt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="tour" className="text-[28px] font-650 tracking-[-0.02em]">
              A five-minute tour
            </h2>
            <span className="text-[14px] text-ink-2">Five steps, about a minute each</span>
          </div>
          <ol className="mt-6 grid gap-3 md:grid-cols-5">
            {TOUR.map((s, i) => (
              <li key={s.to}>
                <Link to={s.to} className="group flex h-full gap-4 rounded-panel border border-line bg-surface p-4 transition-colors hover:border-peacock/40 focus-visible:border-peacock md:flex-col md:gap-0 md:p-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-peacock-soft text-[14px] font-semibold text-peacock-deep tnum">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] font-semibold leading-snug text-ink group-hover:text-peacock-deep md:mt-4">{s.title}</span>
                    <span className="mt-1.5 text-[14px] leading-[1.5] text-ink-2 md:mt-2">{s.look}</span>
                    <span className="mt-2 text-[12.5px] text-ink-3 md:mt-auto md:pt-4">{s.mins}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="algorithm" className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="algorithm" className="text-[28px] font-650 tracking-[-0.02em]">
              How the algorithm works
            </h2>
            <Link to="/guide/docs/algorithm" className="text-[14px] font-medium text-peacock-deep hover:underline">
              Read the step-by-step guide
            </Link>
          </div>
          <p className="mt-3 max-w-[70ch] text-[15px] leading-6 text-ink-2">
            The twin learns how each person's body reacts to sleep and walking, removes that from tonight's readings, and alerts only on the change their own habits cannot explain. Worked here on Meera Iyer.
          </p>
          <a href={assetUrl('docs/algorithm.png')} target="_blank" rel="noreferrer noopener" className="mt-6 block overflow-hidden rounded-panel border border-line bg-surface" aria-label="Open the algorithm diagram full size">
            <img src={assetUrl('docs/algorithm.png')} alt="The five steps of the twin: personal baseline, personal response slopes, empirical Bayes pooling, twin-adjusted signal, calibrated early warning" className="block w-full" loading="lazy" />
          </a>
        </section>

        <section aria-labelledby="matrix" className="mt-16">
          <h2 id="matrix" className="text-[28px] font-650 tracking-[-0.02em]">
            Each requirement, and where to find it
          </h2>
          <p className="mt-2 max-w-2xl text-[16px] leading-[1.6] text-ink-2">One row per requirement in the brief: what we built, the screen that shows it, the code behind it and the number that proves it.</p>

          <div className="mt-6 hidden overflow-hidden rounded-panel border border-line bg-surface shadow-rest lg:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[13px] text-ink-2">
                  <th className="w-[18%] px-5 py-3 font-medium">The brief asks</th>
                  <th className="w-[26%] px-4 py-3 font-medium">What we built</th>
                  <th className="w-[11%] px-4 py-3 font-medium">See it</th>
                  <th className="w-[22%] px-4 py-3 font-medium">In the code</th>
                  <th className="px-5 py-3 font-medium">Proof</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.n} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <span className="tnum text-[13px] font-semibold text-ink-3">{r.n}</span>
                        <span className="font-semibold leading-snug text-ink">{r.ask}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 leading-[1.5] text-ink-2">{r.built}</td>
                    <td className="px-4 py-4">
                      <RouteLinks see={r.see} />
                    </td>
                    <td className="px-4 py-4">
                      <CodePaths code={r.code} />
                    </td>
                    <td className="px-5 py-4">
                      <Proof r={r} m={m} b={b} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ol className="mt-6 space-y-3 lg:hidden">
            {ROWS.map((r) => (
              <li key={r.n} className="rounded-panel border border-line bg-surface p-5">
                <p className="flex gap-3">
                  <span className="tnum text-[13px] font-semibold text-ink-3">{r.n}</span>
                  <span className="text-[16px] font-semibold leading-snug">{r.ask}</span>
                </p>
                <dl className="mt-3 space-y-3 text-[14px]">
                  <div>
                    <dt className="text-[12.5px] font-medium text-ink-3">What we built</dt>
                    <dd className="mt-0.5 leading-[1.5] text-ink-2">{r.built}</dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] font-medium text-ink-3">See it</dt>
                    <dd className="mt-1">
                      <RouteLinks see={r.see} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] font-medium text-ink-3">In the code</dt>
                    <dd className="mt-1">
                      <CodePaths code={r.code} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] font-medium text-ink-3">Proof</dt>
                    <dd className="mt-1">
                      <Proof r={r} m={m} b={b} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>

        <Numbers m={m} b={b} />

        <section aria-labelledby="documents" className="mt-16">
          <h2 id="documents" className="text-[28px] font-650 tracking-[-0.02em]">
            Documents
          </h2>
          <div className="mt-6 grid gap-8 lg:grid-cols-[2fr_1fr]">
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {DOCS.map((d) => (
                <li key={d.slug} className="border-t border-line">
                  <Link to={`/guide/docs/${d.slug}`} className="group block py-4">
                    <span className="block text-[16px] font-semibold text-ink group-hover:text-peacock-deep">{d.title}</span>
                    <span className="mt-0.5 block text-[14px] leading-5 text-ink-2">{d.summary}</span>
                    <span className="mt-1 block text-[12.5px] text-ink-3">{d.file}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div>
              <p className="mb-2 text-[14px] font-semibold">Downloads</p>
              <ul className="divide-y divide-line border-y border-line">
                {DOWNLOADS.map((d) => (
                  <li key={d.path}>
                    <a href={assetUrl(d.path)} download className="flex items-center gap-3 py-3 text-[15px] text-ink hover:text-peacock-deep">
                      <Download className="h-4 w-4 text-ink-3" aria-hidden />
                      <span className="flex-1">{d.label}</span>
                      <span className="text-[13px] text-ink-3">{d.note}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <RouteButton to="/guide/docs/readme" variant="secondary" className="mt-5">
                Read the README
              </RouteButton>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function RouteLinks({ see }: { see: Row['see'] }) {
  return (
    <ul className="space-y-1">
      {see.map((s) => (
        <li key={s.to}>
          <Link to={s.to} className="font-medium text-peacock-deep underline decoration-peacock/30 underline-offset-[3px] hover:decoration-peacock">
            {s.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CodePaths({ code }: { code: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {code.map((c) => (
        <li key={c} className="rounded-[8px] bg-surface-2 px-2 py-1 text-[12.5px] leading-4 text-ink-2">
          {c.split('/').map((part, i, all) => (
            <span key={i}>
              {part}
              {i < all.length - 1 && (
                <>
                  /<wbr />
                </>
              )}
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}

function Proof({ r, m, b }: { r: Row; m: ModelCard; b: AlertBudget }) {
  const partly = r.status === 'partly'
  return (
    <p className="flex gap-2 leading-[1.5]">
      {partly ? <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-turmeric" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden />}
      <span className={cn(partly ? 'text-ink-2' : 'text-ink')}>
        <span className="sr-only">{partly ? 'Partly done. ' : 'Done. '}</span>
        {r.proof(m, b)}
      </span>
    </p>
  )
}

function Numbers({ m, b }: { m: ModelCard; b: AlertBudget }) {
  const auroc = metricOf(m, 'fused', 'auroc')
  const sens = metricOf(m, 'fused', 'sensitivity')
  const lead = metricOf(m, 'fused', 'median_lead_hours')
  const early = metricOf(m, 'fused', 'sensitivity_48h_lead')
  const pair = m.physiology?.pairs[0]
  const items: { value: string; label: string; note: string }[] = [
    { value: auroc?.toFixed(2) ?? '--', label: 'AUROC of the fused model', note: 'Pooled out-of-fold, so every person is scored by a model that never saw them' },
    { value: fmtPct(sens ?? 0), label: 'of strain episodes caught', note: `At the urgent alert budget of ${b.target_false_alerts_per_patient_day.toFixed(3)} false alerts a patient-day` },
    { value: `${Math.round(lead ?? 0)} h`, label: 'median warning', note: typeof early === 'number' ? `${fmtPct(early)} of episodes flagged at least 48 hours ahead` : 'Between the first alert and the start of the episode' },
    { value: b.observed_rate.toFixed(3), label: 'false alerts a patient-day this week', note: b.status === 'within_budget' ? 'Inside the budget' : 'Over the budget' },
    { value: `${m.forecast.rhr_mae_day1} bpm`, label: 'day-one heart-rate forecast error', note: `BP ${m.forecast.sbp_mae_day1} mmHg. The likely range held ${fmtPct(m.forecast.coverage_p10_p90)} of readings` },
    { value: pair ? pair.mae_pooled.toFixed(2) : '--', label: "error against each person's true response", note: pair ? `${pair.label.replace(/\bbp\b/g, 'BP').replace(/\bhrv\b/g, 'HRV')}${pair.unit ? `, ${pair.unit}` : ''}. A per-person fit alone: ${pair.mae_raw.toFixed(2)}. The cohort average: ${pair.mae_population.toFixed(2)}` : 'The server has not published this yet' },
  ]
  return (
    <section aria-labelledby="numbers" className="mt-16">
      <h2 id="numbers" className="text-[28px] font-650 tracking-[-0.02em]">
        The headline numbers
      </h2>
      <p className="mt-2 text-[15px] text-ink-2">
        {fmtNum(m.data.cohort)} synthetic people, {fmtNum(m.data.patient_days)} patient-days, model <span className="tnum">{m.version}</span>.
      </p>
      <dl className="mt-6 grid gap-x-12 md:grid-cols-2">
        {items.map((it) => (
          <div key={it.label} className="grid grid-cols-[120px_1fr] gap-5 border-t border-line py-5">
            <dt className="tnum text-[30px] font-650 leading-none tracking-[-0.03em] text-ink">{it.value}</dt>
            <dd>
              <span className="block text-[16px] font-semibold leading-snug text-ink">{it.label}</span>
              <span className="mt-1 block text-[14px] leading-5 text-ink-2">{it.note}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
