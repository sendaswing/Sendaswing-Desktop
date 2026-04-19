import React from 'react'
import { Video, BarChart2, Columns } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

export type AppRoute = 'capture' | 'analyze' | 'compare'

interface SidebarProps {
  route: AppRoute
  onNavigate: (route: AppRoute) => void
}

const NAV_ITEMS: Array<{ route: AppRoute; icon: React.ComponentType<any>; label: string }> = [
  { route: 'capture', icon: Video, label: 'Capture' },
  { route: 'analyze', icon: BarChart2, label: 'Analyze' },
  { route: 'compare', icon: Columns, label: 'Compare' }
]

export function Sidebar({ route, onNavigate }: SidebarProps) {
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
    </aside>
  )
}
