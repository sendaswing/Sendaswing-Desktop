import React, { useState } from 'react'
import { Square, Columns, FlipHorizontal, Video, Loader2 } from 'lucide-react'
import { ClipBrowser } from './ClipBrowser'
import { VideoPlayer } from './VideoPlayer'
import { ToolPalette } from './ToolPalette'
import { RightVideoPanel } from './RightVideoPanel'
import { SyncControls } from '../comparison/SyncControls'
import { useAnalysisStore } from '../../store/analysisStore'
import { ImportView } from '../import/ImportView'
import { cn } from '../../lib/utils/cn'
import { useRecordingStore } from '../../store/recordingStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUiStore } from '../../store/uiStore'
import { keyLabel } from '../../hooks/useGlobalHotkeys'

export function AnalysisView() {
  // Selectors, not the whole store: this view must NOT re-render on every frame.
  const activeClip = useAnalysisStore((s) => s.activeClip)
  const flipH = useAnalysisStore((s) => s.flipH)
  const setFlipH = useAnalysisStore((s) => s.setFlipH)
  const pendingImportPath = useAnalysisStore((s) => s.pendingImportPath)
  const setPendingImportPath = useAnalysisStore((s) => s.setPendingImportPath)
  const [dualMode, setDualMode] = useState(false)
  const savingSwing = useRecordingStore((s) => s.bufferStatus === 'processing')
  const toggleLiveKey = useSettingsStore((s) => s.toggleLiveKey)
  const setRoute = useUiStore((s) => s.setRoute)

  // A newly opened/dropped raw file is trimmed and converted before analysis
  if (pendingImportPath) {
    return (
      <ImportView
        initialPath={pendingImportPath}
        onClose={() => setPendingImportPath(null)}
      />
    )
  }

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
        <button
          onClick={() => setFlipH(!flipH)}
          title="Flip horizontal"
          className={cn('p-1.5 rounded transition-colors', flipH ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60 hover:bg-white/5')}
        >
          <FlipHorizontal size={13} />
        </button>
        <div className="flex-1" />
        {dualMode && <SyncControls />}
        <button
          onClick={() => setRoute('capture')}
          title={`Back to live cameras (${keyLabel(toggleLiveKey)})`}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-white/50 hover:text-white/90 hover:bg-white/5 transition-colors"
        >
          <Video size={13} /> Go Live
          <kbd className="px-1 rounded bg-white/10 text-[10px] font-mono">{keyLabel(toggleLiveKey)}</kbd>
        </button>
      </div>

      {/* Main area */}
      <div className="relative flex flex-1 min-h-0">
        {savingSwing && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/80 border border-white/10 text-xs text-white/80 pointer-events-none">
            <Loader2 size={13} className="animate-spin" /> Saving swing…
          </div>
        )}
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
