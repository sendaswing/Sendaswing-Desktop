import React, { useState } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar, type AppRoute } from './Sidebar'
import { CaptureView } from '../capture/CaptureView'
import { AnalysisView } from '../analysis/AnalysisView'
import { ComparisonView } from '../comparison/ComparisonView'

export function AppShell() {
  const [route, setRoute] = useState<AppRoute>('capture')

  return (
    <div className="flex flex-col h-full w-full bg-surface-900">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar route={route} onNavigate={setRoute} />
        <main className="flex-1 min-w-0 overflow-hidden">
          {route === 'capture' && <CaptureView />}
          {route === 'analyze' && <AnalysisView />}
          {route === 'compare' && <ComparisonView />}
        </main>
      </div>
    </div>
  )
}
