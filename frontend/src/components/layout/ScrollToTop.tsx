import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Resets scroll on route change (not on query-only changes such as tab switches). */
export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}
