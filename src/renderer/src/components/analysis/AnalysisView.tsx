import React, { useState } from 'react'
import { Square, Columns } from 'lucide-react'
import { ClipBrowser } from './ClipBrowser'
import { VideoPlayer } from './VideoPlayer'
import { ToolPalette } from './ToolPalette'
import { RightVideoPanel } from './RightVideoPanel'
import { SyncControls } from '../comparison/SyncControls'
import { useAnalysisStore } from '../../store/analysisStore'
import { cn } from '../../lib/utils/cn'

export function AnalysisView() {
  const { activeClip } = useAnalysisStore()
  const [dualMode, setDualMode] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 border-b border-white/5 shrink-0">
        <button
          onClick={() => setDualMode(false)}
          title="Single panel"
          className={cn('p-1.5 rounded transition-colors', !dualMode ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60 hover:bg-white/5')}
        >
          <Square size={13} />
        </button>
        <button
          onClick={() => setDualMode(true)}
          title="Dual panel"
          className={cn('p-1.5 rounded transition-colors', dualMode ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60 hover:bg-white/5')}
        >
          <Columns size={13} />
        </button>
        <div className="flex-1" />
        {dualMode && <SyncControls />}
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        <ClipBrowser />
        <ToolPalette />

        <div className="flex flex-1 min-w-0">
          <div className={cn('flex flex-col min-w-0', dualMode ? 'flex-1' : 'flex-1')}>
            <VideoPlayer clipPath={activeClip?.filePath ?? null} clipDuration={activeClip?.duration} />
          </div>

          {dualMode && (
            <>
              <div className="w-px bg-white/10 shrink-0" />
              <div className="flex-1 min-w-0">
                <RightVideoPanel />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
