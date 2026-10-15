import React from 'react'
import { Video, BarChart2, BookOpen, Settings, MonitorPlay } from 'lucide-react'
import { cn } from '../../lib/utils/cn'
import { useUiStore } from '../../store/uiStore'
import { toggleStreamWindow } from '../stream/streamWindow'

export type AppRoute = 'capture' | 'analyze' | 'library' | 'settings'

interface SidebarProps {
  route: AppRoute
  onNavigate: (route: AppRoute) => void
}

const NAV_ITEMS: Array<{ route: AppRoute; icon: React.ComponentType<any>; label: string }> = [
  { route: 'capture', icon: Video, label: 'Capture' },
  { route: 'analyze', icon: BarChart2, label: 'Analyze' },
  { route: 'library', icon: BookOpen, label: 'Library' },
  { route: 'settings', icon: Settings, label: 'Settings' }
]

export function Sidebar({ route, onNavigate }: SidebarProps) {
  const streamOpen = useUiStore((s) => s.streamWindowOpen)

  return (
    <aside className="w-16 shrink-0 flex flex-col items-center py-4 gap-2 bg-surface-800 border-r border-white/5">
      {NAV_ITEMS.map(({ route: r, icon: Icon, label }) => (
        <button
          key={r}
          onClick={() => onNavigate(r)}
          title={label}
          className={cn(
            'w-11 h-11 flex flex-col items-center justify-center rounded-lg gap-1 transition-colors text-xs',
            route === r
              ? 'bg-accent-500/20 text-accent-400'
              : 'text-white/40 hover:text-white/80 hover:bg-white/5'
          )}
        >
          <Icon size={18} />
          <span className="text-[9px] font-medium tracking-wide">{label}</span>
        </button>
      ))}

      <div className="flex-1" />

      {/* OBS stream window: live cameras on Capture, synced replay on Analyze */}
      <button
        onClick={toggleStreamWindow}
        title={streamOpen ? 'Close the stream window' : 'Open the stream window (for OBS Window Capture)'}
        className={cn(
          'w-11 h-11 flex flex-col items-center justify-center rounded-lg gap-1 transition-colors text-xs',
          streamOpen
            ? 'bg-red-500/20 text-red-400'
            : 'text-white/40 hover:text-white/80 hover:bg-white/5'
        )}
      >
        <MonitorPlay size={18} />
        <span className="text-[9px] font-medium tracking-wide">Stream</span>
      </button>
    </aside>
  )
}
