import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Mark } from '@/brand'
import { RouteButton } from '@/components/ui/Button'
import { Disclaimer } from '@/components/layout/Disclaimer'

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found, Pratibimb'
  }, [])
  return (
    <div className="flex min-h-screen flex-col items-start justify-center bg-mist px-6 md:items-center">
      <div className="max-w-md">
        <Link to="/" aria-label="Pratibimb home">
          <Mark size={64} reflection />
        </Link>
        <h1 className="mt-8 text-[32px] font-650 leading-tight tracking-[-0.025em]">No reflection here</h1>
        <p className="mt-3 text-[16px] leading-[1.6] text-ink-2">This page does not exist. The console, the patient view and the evaluator guide are one click away.</p>
        <div className="mt-7 flex flex-wrap gap-2">
          <RouteButton to="/console">Open the clinician console</RouteButton>
          <RouteButton to="/me/P-0007" variant="secondary">
            Open the patient view
          </RouteButton>
          <RouteButton to="/guide" variant="quiet">
            Evaluator guide
          </RouteButton>
        </div>
        <Disclaimer className="mt-10" />
      </div>
    </div>
  )
}
