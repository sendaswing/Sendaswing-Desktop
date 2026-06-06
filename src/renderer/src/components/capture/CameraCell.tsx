import React, { useEffect, useRef, useState } from 'react'
import { useCameraStore } from '../../store/cameraStore'
import { useRecordingStore } from '../../store/recordingStore'
import { CameraSelector } from './CameraSelector'
import { CameraSettingsPanel } from './CameraSettingsPanel'
import { CameraOff, Circle, Settings2 } from 'lucide-react'
import { cn } from '../../lib/utils/cn'
import { formatDuration } from '../../lib/utils/formatTime'

interface CameraCellProps {
  slotIndex: number
}

export function CameraCell({ slotIndex }: CameraCellProps) {
  const slot = useCameraStore((s) => s.slots[slotIndex])
  const recState = useRecordingStore((s) => s.slotRecordings[slotIndex])
  const countdown = useRecordingStore((s) => s.countdown)
  const isRecordingAll = useRecordingStore((s) => s.isRecordingAll)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (videoRef.current && slot.stream) {
      videoRef.current.srcObject = slot.stream
    } else if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [slot.stream])

  // Close settings panel when recording starts
  useEffect(() => {
    if (isRecordingAll) setShowSettings(false)
  }, [isRecordingAll])

  return (
    <div className="relative w-full h-full bg-black flex flex-col">
      <div className="relative flex-1 min-h-0">
        {slot.status === 'streaming' ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/20">
            <CameraOff size={32} />
            <span className="text-xs">No feed</span>
          </div>
        )}

        {/* Recording elapsed badge */}
        {recState.status === 'recording' && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-600/90 rounded px-2 py-0.5">
            <Circle size={6} className="fill-white text-white animate-pulse" />
            <span className="text-white text-xs font-mono">{formatDuration(recState.elapsed)}</span>
          </div>
        )}

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
            <span className="text-8xl font-bold text-white drop-shadow-lg tabular-nums leading-none">
              {countdown}
            </span>
          </div>
        )}

        {/* Camera settings gear — only when streaming and not busy */}
        {slot.status === 'streaming' && !isRecordingAll && countdown === null && (
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={cn(
              'absolute top-2 left-2 p-1 rounded transition-colors',
              showSettings ? 'bg-white/20 text-white' : 'bg-black/40 text-white/40 hover:text-white/80 hover:bg-black/60'
            )}
            title="Camera settings"
          >
            <Settings2 size={13} />
          </button>
        )}

        {/* Camera settings panel */}
        {showSettings && slot.stream && (
          <CameraSettingsPanel stream={slot.stream} onClose={() => setShowSettings(false)} />
        )}
      </div>

      <div className="flex items-center justify-between px-2 py-1.5 bg-surface-800 border-t border-white/5">
        <span className="text-xs text-white/40 font-medium">CAM {slotIndex + 1}</span>
        <CameraSelector slotIndex={slotIndex} />
      </div>
    </div>
  )
}
