import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Counts a number up once on mount (the twin page's one orchestrated moment).
 * Reduced motion shows the final value straight away.
 */
export function useCountUp(target: number | null, durationMs = 900): number | null {
  const reduce = useReducedMotion()
  const [value, setValue] = useState<number | null>(reduce || target === null ? target : 0)
  const done = useRef(false)
  useEffect(() => {
    if (target === null) {
      setValue(null)
      return
    }
    if (reduce || done.current) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(step)
      else done.current = true
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduce, durationMs])
  return value
}
