import React, { useEffect, useRef } from 'react'
import { Circle, Square, StretchHorizontal, LayoutDashboard, X, Save, Loader2 } from 'lucide-react'
import { useCameraStore } from '../../store/cameraStore'
import { useRecordingStore } from '../../store/recordingStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useRecorder } from '../../hooks/useRecorder'
import { registerStandardRecordToggle, keyLabel } from '../../hooks/useGlobalHotkeys'
import { bufferedCapture } from '../../lib/recording/BufferedCaptureController'
import { TriggerMicControls } from './TriggerMicControls'
import { cn } from '../../lib/utils/cn'
import type { GridLayout } from '../../types/camera'

const LAYOUTS: Array<{ layout: GridLayout; icon: React.ComponentType<any>; label: string }> = [
  { layout: '1x1', icon: Square, label: '1 cam' },
  { layout: '2x1', icon: StretchHorizontal, label: '2 cam' },
  { layout: '2x2', icon: LayoutDashboard, label: '4 cam' }
]

const CLUBS = ['Driver', 'Iron', 'Wedge', 'FW', 'Hybrid', 'Putt'] as const

export function RecordingControls() {
  const { slots, gridLayout, setGridLayout } = useCameraStore()
  const { isRecordingAll, pendingClub, countdown, setPendingClub, slotRecordings } = useRecordingStore()
  const { recordingDuration, captureMode, setCaptureMode, preRollSec, postRollSec, saveSwingKey, toggleLiveKey } = useSettingsStore()
  const bufferStatus = useRecordingStore((s) => s.bufferStatus)
  const bufferedSec = useRecordingStore((s) => s.bufferedSec)
  const buffered = captureMode === 'buffered'
  const { startAll, stopAll, cancelCountdown } = useRecorder()

  const activeSlots = slots.filter((s) => s.stream && s.status === 'streaming')
  const missingAngle = activeSlots.some((s) => !s.cameraAngle)
  const canRecord = activeSlots.length > 0 && !missingAngle
  const isCounting = countdown !== null

  const maxElapsed = isRecordingAll
    ? Math.max(0, ...slotRecordings.filter((r) => r.status === 'recording' && r.startTime !== null).map((r) => r.elapsed))
    : 0
  const remaining = isRecordingAll && recordingDuration > 0
    ? Math.max(0, recordingDuration - maxElapsed)
    : null

  const handleRecord = async () => {
    if (isCounting) { cancelCountdown(); return }
    if (isRecordingAll) { await stopAll(); return }
    if (!canRecord) return
    await startAll(
      activeSlots.map((s) => ({
        index: s.index,
        stream: s.stream!,
        label: s.label,
        cameraAngle: s.cameraAngle,
        club: pendingClub
      }))
    )
  }

  const busy = isCounting || isRecordingAll

  // Save Swing hotkey starts/stops a normal recording in Standard mode
  const handleRecordRef = useRef(handleRecord)
  handleRecordRef.current = handleRecord
  useEffect(() => {
    registerStandardRecordToggle(() => { void handleRecordRef.current() })
    return () => registerStandardRecordToggle(null)
  }, [])

  const bufferBusy = bufferStatus === 'capturing'

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2 bg-surface-800 border-t border-white/5 shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-white/30 shrink-0">Club:</span>
        <div className="flex flex-wrap gap-1">
          {CLUBS.map((club) => (
            <button
              key={club}
              onClick={() => setPendingClub(pendingClub === club ? '' : club)}
              disabled={busy}
              className={cn(
                'px-2 py-0.5 rounded text-xs transition-colors',
                pendingClub === club
                  ? 'bg-accent-500/80 text-black font-semibold'
                  : 'bg-white/5 text-white/35 hover:text-white/70 hover:bg-white/10',
                busy && 'opacity-40 cursor-not-allowed'
              )}
            >
              {club}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Capture mode */}
        <div className="flex items-center rounded bg-white/5 p-0.5" title={`Buffered keeps the last ${preRollSec}s rolling and saves the swing when the strike is heard (or ${keyLabel(saveSwingKey)} is pressed)`}>
          {(['standard', 'buffered'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setCaptureMode(m)}
              disabled={busy || bufferBusy}
              className={cn(
                'px-2 py-0.5 rounded text-xs transition-colors capitalize',
                captureMode === m ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/70',
                (busy || bufferBusy) && 'opacity-40 cursor-not-allowed'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {LAYOUTS.map(({ layout, icon: Icon, label }) => (
            <button
              key={layout}
              onClick={() => setGridLayout(layout)}
              disabled={busy}
              title={label}
              className={cn(
                'p-1.5 rounded transition-colors',
                gridLayout === layout ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60 hover:bg-white/5',
                busy && 'opacity-40 cursor-not-allowed'
              )}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        {buffered && <TriggerMicControls disabled={bufferBusy} />}

        <div className="flex-1" />

        {!busy && missingAngle && activeSlots.length > 0 && (
          <span className="text-xs text-amber-400/70">Set angle first</span>
        )}

        {remaining !== null && (
          <span className="text-xs font-mono text-white/50">{remaining}s left</span>
        )}

        {buffered ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/45 whitespace-nowrap">
              {bufferStatus === 'capturing' ? (
                <span className="text-red-400 font-semibold">Recording follow-through…</span>
              ) : bufferStatus === 'processing' ? (
                <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving swing…</span>
              ) : bufferStatus === 'buffering' ? (
                <>Ready · {bufferedSec.toFixed(1)}s / {preRollSec}s pre-roll · {postRollSec}s after</>
              ) : activeSlots.length === 0 ? (
                'Start a camera to begin buffering'
              ) : null}
            </span>
            <button
              onClick={() => { void bufferedCapture.trigger() }}
              disabled={bufferStatus === 'off' || bufferBusy}
              title={`Save the last ${preRollSec}s + next ${postRollSec}s (${keyLabel(saveSwingKey)}). ${keyLabel(toggleLiveKey)} switches Live ⇄ Replay.`}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded font-semibold text-sm transition-colors',
                bufferStatus !== 'off' && !bufferBusy
                  ? 'bg-accent-500 hover:bg-accent-600 text-black'
                  : 'bg-white/10 text-white/25 cursor-not-allowed'
              )}
            >
              <Save size={14} /> Save Swing
              <kbd className="ml-1 px-1 rounded bg-black/20 text-[10px] font-mono">{keyLabel(saveSwingKey)}</kbd>
            </button>
          </div>
        ) : isCounting ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums text-accent-400 w-6 text-center leading-none">{countdown}</span>
            <button
              onClick={cancelCountdown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold text-sm bg-white/10 hover:bg-white/15 text-white/70 transition-colors"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleRecord}
            disabled={!isRecordingAll && !canRecord}
            title={!isRecordingAll && missingAngle ? 'Set camera angle before recording' : undefined}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded font-semibold text-sm transition-colors',
              isRecordingAll
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : canRecord
                ? 'bg-accent-500 hover:bg-accent-600 text-black'
                : 'bg-white/10 text-white/25 cursor-not-allowed'
            )}
          >
            {isRecordingAll ? (
              <><Square size={14} className="fill-white" /> Stop Recording</>
            ) : (
              <><Circle size={14} className="fill-current" /> Record</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
