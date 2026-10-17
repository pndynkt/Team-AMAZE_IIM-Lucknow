import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/api/client'
import type { Meta } from '@/api/types'

const FALLBACK: Meta = {
  app: 'Pratibimb',
  version: '1.0.0',
  as_of: '2026-10-12',
  cohort_size: 240,
  days: 120,
  condition: 'Hypertension with cardiovascular risk',
  event_definition: 'Cardiovascular strain episode within the next 72 hours',
  model_version: 'fusion-lgbm-2026.10.12',
  demo_speed: 10,
}

interface MetaCtx {
  meta: Meta
  loaded: boolean
  clinician: string
}

const Ctx = createContext<MetaCtx>({ meta: FALLBACK, loaded: false, clinician: 'Dr Kavya Rao' })

/** Loads /api/meta once; everything that needs "today" (as_of) or the demo clock reads it from here. */
export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta>(FALLBACK)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    api
      .meta()
      .then((m) => {
        if (alive) setMeta(m)
      })
      .catch(() => {
        /* fall back to defaults; pages surface their own errors */
      })
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])
  return <Ctx.Provider value={{ meta, loaded, clinician: 'Dr Kavya Rao' }}>{children}</Ctx.Provider>
}

export function useMeta() {
  return useContext(Ctx)
}
