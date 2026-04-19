import React from 'react'
import { Circle, Square, LayoutGrid, StretchHorizontal, LayoutDashboard } from 'lucide-react'
import { useCameraStore } from '../../store/cameraStore'
import { useRecordingStore } from '../../store/recordingStore'
import { useRecorder } from '../../hooks/useRecorder'
import { cn } from '../../lib/utils/cn'
import type { GridLayout } from '../../types/camera'

const LAYOUTS: Array<{ layout: GridLayout; icon: React.ComponentType<any>; label: string }> = [
  { layout: '1x1', icon: Square, label: '1 cam' },
  { layout: '2x1', icon: StretchHorizontal, label: '2 cam' },
  { layout: '2x2', icon: LayoutDashboard, label: '4 cam' }
]

export function RecordingControls() {
  const { slots, gridLayout, setGridLayout } = useCameraStore()
  const { isRecordingAll } = useRecordingStore()
  const { startAll, stopAll } = useRecorder()

  const handleRecord = async () => {
    if (isRecordingAll) {
      await stopAll()
      return
    }

    const activeSlots = slots
      .filter((s) => s.stream && s.status === 'streaming')
      .map((s) => ({ index: s.index, stream: s.stream!, label: s.label }))

    if (activeSlots.length === 0) return
    await startAll(activeSlots)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface-800 border-t border-white/5 shrink-0">
      <div className="flex items-center gap-1">
        {LAYOUTS.map(({ layout, icon: Icon, label }) => (
          <button
            key={layout}
            onClick={() => setGridLayout(layout)}
            title={label}
            className={cn(
              'p-1.5 rounded transition-colors',
              gridLayout === layout ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60 hover:bg-white/5'
            )}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={handleRecord}
        className={cn(
          'flex items-center gap-2 px-4 py-1.5 rounded font-semibold text-sm transition-colors',
          isRecordingAll
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-accent-500 hover:bg-accent-600 text-black'
        )}
      >
        {isRecordingAll ? (
          <>
            <Square size={14} className="fill-white" />
            Stop Recording
          </>
        ) : (
          <>
            <Circle size={14} className="fill-current" />
            Record
          </>
        )}
      </button>
    </div>
  )
}
