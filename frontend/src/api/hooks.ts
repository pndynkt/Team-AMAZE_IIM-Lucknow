import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  /** True while re-fetching after the first successful load. */
  refreshing: boolean
  refetch: () => Promise<void>
  setData: (updater: T | ((prev: T | null) => T | null)) => void
}

/**
 * Small fetch hook: runs `fn` whenever `deps` change, keeps the previous data
 * while refetching, and exposes `refetch` for toast retry buttons.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[], opts: { enabled?: boolean } = {}): AsyncState<T> {
  const enabled = opts.enabled ?? true
  const [data, setDataState] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState<boolean>(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const run = useCallback(async () => {
    if (!enabled) return
    const id = ++seq.current
    if (data === null) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const result = await fnRef.current()
      if (id !== seq.current) return
      setDataState(result)
    } catch (e) {
      if (id !== seq.current) return
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (id === seq.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    void run()
  }, [run, enabled])

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater))
  }, [])

  return { data, error, loading, refreshing, refetch: run, setData }
}

/** Polls `fn` every `intervalMs` while `active`; pauses when the tab is hidden. */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, active: boolean, deps: unknown[] = []): AsyncState<T> {
  const state = useApi(fn, deps, { enabled: active })
  const { refetch } = state
  useEffect(() => {
    if (!active) return
    let timer: number | undefined
    const tick = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    timer = window.setInterval(tick, intervalMs)
    return () => {
      if (timer) window.clearInterval(timer)
    }
  }, [active, intervalMs, refetch])
  return state
}
