import React, { useRef, useCallback } from 'react'
import { useAnalysisStore } from '../../store/analysisStore'

interface ScrubberBarProps {
  onSeek: (frame: number) => void
  onScrubStart?: () => void
  currentFrame?: number
  totalFrames?: number
  preloadProgress?: number
}

export function ScrubberBar({ onSeek, onScrubStart, currentFrame: currentFrameProp, totalFrames: totalFramesProp, preloadProgress = 1 }: ScrubberBarProps) {
  const store = useAnalysisStore()
  const currentFrame = currentFrameProp ?? store.currentFrame
  const totalFrames = totalFramesProp ?? store.totalFrames

  const trackRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const rafPending = useRef(false)
  const pendingFrame = useRef(0)

  const safeTotal = isFinite(totalFrames) && totalFrames > 1 ? totalFrames : 0

  const getFrameFromPointer = useCallback((clientX: number): number => {
    const track = trackRef.current
    if (!track || safeTotal === 0) return 0
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * (safeTotal - 1))
  }, [safeTotal])

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
    onScrubStart?.()
    isDragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    scheduleSeek(getFrameFromPointer(e.clientX))
  }, [onScrubStart, getFrameFromPointer, scheduleSeek])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    scheduleSeek(getFrameFromPointer(e.clientX))
  }, [getFrameFromPointer, scheduleSeek])

  const onPointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const progress = safeTotal > 1 ? Math.min(1, currentFrame / (safeTotal - 1)) : 0

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
          {/* Preload fill — subtle underlay showing background decode progress */}
          {preloadProgress < 1 && (
            <div
              className="absolute inset-y-0 left-0 bg-white/15 transition-none"
              style={{ width: `${preloadProgress * 100}%` }}
            />
          )}
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
