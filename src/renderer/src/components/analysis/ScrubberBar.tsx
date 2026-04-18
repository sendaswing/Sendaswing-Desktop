import React, { useRef, useCallback, useEffect } from 'react'
import { useAnalysisStore } from '../../store/analysisStore'

interface ScrubberBarProps {
  onSeek: (frame: number) => void
}

export function ScrubberBar({ onSeek }: ScrubberBarProps) {
  const { currentFrame, totalFrames } = useAnalysisStore()
  const trackRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const rafPending = useRef(false)
  const pendingFrame = useRef(0)

  const getFrameFromPointer = useCallback((clientX: number): number => {
    const track = trackRef.current
    if (!track || totalFrames === 0) return 0
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * (totalFrames - 1))
  }, [totalFrames])

  const flushSeek = useCallback(() => {
    rafPending.current = false
    onSeek(pendingFrame.current)
  }, [onSeek])

  const scheduleSeek = useCallback((frame: number) => {
    pendingFrame.current = frame
    if (!rafPending.current) {
      rafPending.current = true
      requestAnimationFrame(flushSeek)
    }
  }, [flushSeek])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    scheduleSeek(getFrameFromPointer(e.clientX))
  }, [getFrameFromPointer, scheduleSeek])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    scheduleSeek(getFrameFromPointer(e.clientX))
  }, [getFrameFromPointer, scheduleSeek])

  const onPointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const progress = totalFrames > 1 ? currentFrame / (totalFrames - 1) : 0

  return (
    <div className="flex flex-col gap-1 px-4 py-2 select-none">
      <div
        ref={trackRef}
        className="relative h-5 flex items-center cursor-pointer group"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-500 rounded-full transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div
          className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-lg -translate-x-1/2 transition-none pointer-events-none"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}
