import React from 'react'
import { Minus, Square, X } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

export function TitleBar() {
  const api = (window as any).electronAPI?.titlebar

  return (
    <div className="drag-region h-9 flex items-center justify-between bg-surface-900 border-b border-white/5 px-4 select-none shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-accent-500 opacity-80" />
        <span className="text-xs font-semibold text-white/60 tracking-widest uppercase">Sendaswing</span>
      </div>
      <div className="no-drag flex items-center">
        <TitleBarButton onClick={() => api?.minimize()} title="Minimize">
          <Minus size={12} />
        </TitleBarButton>
        <TitleBarButton onClick={() => api?.maximize()} title="Maximize">
          <Square size={11} />
        </TitleBarButton>
        <TitleBarButton onClick={() => api?.close()} title="Close" danger>
          <X size={12} />
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({
  children,
  onClick,
  title,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded transition-colors text-white/50',
        danger ? 'hover:bg-red-500/80 hover:text-white' : 'hover:bg-white/10 hover:text-white'
      )}
    >
      {children}
    </button>
  )
}
