import React from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { CaptureView } from '../capture/CaptureView'
import { AnalysisView } from '../analysis/AnalysisView'
import { LibraryView } from '../library/LibraryView'
import { SettingsView } from '../settings/SettingsView'
import { useUiStore } from '../../store/uiStore'
import { useGlobalHotkeys } from '../../hooks/useGlobalHotkeys'
import { cn } from '../../lib/utils/cn'

export function AppShell() {
  // Route lives in a store so capture and hotkeys can switch screens
  const route = useUiStore((s) => s.route)
  const setRoute = useUiStore((s) => s.setRoute)
  const toast = useUiStore((s) => s.toast)

  useGlobalHotkeys()

  return (
    <div className="flex flex-col h-full w-full bg-surface-900">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar route={route} onNavigate={setRoute} />
        <main className="relative flex-1 min-w-0 overflow-hidden">
          {route === 'capture' && <CaptureView />}
          {route === 'analyze' && <AnalysisView />}
          {route === 'library' && <LibraryView onNavigate={setRoute} />}
          {route === 'settings' && <SettingsView />}

          {toast && (
            <div
              className={cn(
                'absolute bottom-16 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-md text-xs shadow-lg pointer-events-none max-w-[80%] truncate',
                toast.kind === 'error' ? 'bg-red-600/90 text-white' : 'bg-surface-600/95 text-white/85 border border-white/10'
              )}
            >
              {toast.text}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
