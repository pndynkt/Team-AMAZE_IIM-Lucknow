import { useEffect, useState } from 'react'
import { Moon, RotateCcw, Sun } from 'lucide-react'
import { IS_MOCK, api } from '@/api/client'
import { useApi } from '@/api/hooks'
import { PageHeader } from '@/components/layout/ConsoleShell'
import { Panel } from '@/components/ui/Panel'
import { Chip } from '@/components/ui/Chip'
import { Stat } from '@/components/ui/Stat'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useMeta } from '@/lib/meta'
import { fmtDayFull } from '@/lib/format'
import { readTheme, setDarkClass, writeTheme, type Theme } from '@/lib/theme'

export default function SettingsPage() {
  const { meta, clinician } = useMeta()
  const toast = useToast()
  const resetDemo = async () => {
    const mod = await import('@/api/mock')
    mod.resetMockState()
    toast.success('Demo data reset', 'Alerts, escalations, notes and the audit log are back to the start.')
  }
  const health = useApi(() => api.health(), [])
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    setDarkClass(theme === 'dark')
    writeTheme(theme)
  }, [theme])

  return (
    <div>
      <PageHeader title="Settings" subtitle="Demo controls. There is no sign-in in this proof of concept." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Signed in as">
          <p className="text-[15px] font-semibold">{clinician}</p>
          <p className="mt-1 text-[14px] leading-5 text-ink-2">Physician. Replies to the doctor step of a ladder within 60 minutes. Every action in the console is written to the audit log under this name.</p>
        </Panel>
        <Panel title="Appearance" subtitle="Dark is for the console only. The patient view stays light for reading in daylight.">
          <Tabs
            variant="segmented"
            aria-label="Theme"
            value={theme}
            onChange={setTheme}
            items={[
              { key: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="h-4 w-4" aria-hidden /> Light</span> },
              { key: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="h-4 w-4" aria-hidden /> Dark</span> },
            ]}
          />
        </Panel>
        <Panel
          title="Data source"
          action={IS_MOCK ? <Chip tone="turmeric">Demo data in this browser</Chip> : <Chip tone={health.data?.ok ? 'leaf' : health.error ? 'sindoor' : 'neutral'}>{health.data?.ok ? 'Connected' : health.error ? 'Not reachable' : 'Checking'}</Chip>}
        >
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Server" value={IS_MOCK ? 'None' : 'Live'} size="sm" />
            <Stat label="Model" value={health.data ? (health.data.model_loaded ? 'Loaded' : 'Missing') : IS_MOCK ? 'Fixtures' : '--'} size="sm" />
            <Stat label="Cohort" value={health.data ? (health.data.cohort_loaded ? 'Loaded' : 'Missing') : IS_MOCK ? 'Fixtures' : '--'} size="sm" />
          </div>
          <p className="mt-4 text-[13.5px] leading-5 text-ink-2">
            {IS_MOCK ? 'Every call is answered from the fixtures in src/api/fixtures. Changes are kept in this browser and shared between tabs.' : 'In development the page sends /api requests to the server on port 8000.'}
          </p>
          {IS_MOCK && (
            <Button variant="secondary" size="sm" className="mt-4" icon={<RotateCcw />} onClick={() => void resetDemo()}>
              Reset the demo data
            </Button>
          )}
        </Panel>
        <Panel title="Demo clock">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Speed" value={`${meta.demo_speed} times`} size="sm" hint={`60 s takes ${Math.round(60 / Math.max(1, meta.demo_speed))} s`} />
            <Stat label="Cohort as of" value={fmtDayFull(meta.as_of).replace(/^\w+ /, '')} size="sm" />
            <Stat label="Version" value={meta.version} size="sm" />
          </div>
        </Panel>
      </div>
    </div>
  )
}
