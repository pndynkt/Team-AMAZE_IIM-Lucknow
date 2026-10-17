import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BrandLoader } from '@/brand'
import { ToastProvider } from '@/components/ui/Toast'
import { MetaProvider } from '@/lib/meta'
import { ConsoleShell } from '@/components/layout/ConsoleShell'
import { ScrollToTop } from '@/components/layout/ScrollToTop'

const Landing = lazy(() => import('@/pages/Landing'))
const Triage = lazy(() => import('@/pages/console/Triage'))
const PatientTwin = lazy(() => import('@/pages/console/PatientTwin'))
const AlertsPage = lazy(() => import('@/pages/console/Alerts'))
const ThresholdsPage = lazy(() => import('@/pages/console/Thresholds'))
const ModelPage = lazy(() => import('@/pages/console/Model'))
const AuditPage = lazy(() => import('@/pages/console/Audit'))
const SettingsPage = lazy(() => import('@/pages/console/Settings'))
const PatientView = lazy(() => import('@/pages/me/PatientView'))
const Guide = lazy(() => import('@/pages/guide/Guide'))
const GuideDocs = lazy(() => import('@/pages/guide/GuideDocs'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const BrandSheet = lazy(() => import('@/brand/BrandSheet'))

// One place decides the router: a static snapshot can be hosted anywhere with VITE_ROUTER=hash.
const Router = ({ children }: { children: ReactNode }) => (import.meta.env.VITE_ROUTER === 'hash' ? <HashRouter>{children}</HashRouter> : <BrowserRouter basename={basename()}>{children}</BrowserRouter>)

/** BrowserRouter needs an absolute basename; a relative base (./) means the app sits at the root. */
function basename(): string | undefined {
  const b = import.meta.env.BASE_URL
  if (!b || b === '/' || b.startsWith('.')) return undefined
  return b.replace(/\/$/, '')
}

function PageFallback() {
  return <BrandLoader label="Loading the twin" className="min-h-[60vh]" />
}

export default function App() {
  return (
    <Router>
      <MetaProvider>
        <ToastProvider>
          <ScrollToTop />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/console" element={<ConsoleShell />}>
                <Route index element={<Triage />} />
                <Route path="patients/:id" element={<PatientTwin />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="thresholds" element={<ThresholdsPage />} />
                <Route path="model" element={<ModelPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="/me" element={<Navigate to="/me/P-0007" replace />} />
              <Route path="/me/:id" element={<PatientView />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/guide/docs" element={<Navigate to="/guide/docs/readme" replace />} />
              <Route path="/guide/docs/:slug" element={<GuideDocs />} />
              <Route path="/brand" element={<BrandSheet />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </MetaProvider>
    </Router>
  )
}
