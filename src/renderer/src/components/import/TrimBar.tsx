import React, { useCallback, useRef } from 'react'

interface TrimBarProps {
  duration: number
  inPoint: number
  outPoint: number
  currentTime: number
  onSeek: (t: number) => void
  onChangeIn: (t: number) => void
  onChangeOut: (t: number) => void
}

type DragTarget = 'in' | 'out' | 'playhead' | null

const MIN_CLIP_SECS = 0.1

/**
 * Timeline with draggable In/Out handles and a playhead.
 * Drag the handles to trim; click/drag anywhere else to scrub the preview.
 */
export function TrimBar({ duration, inPoint, outPoint, currentTime, onSeek, onChangeIn, onChangeOut }: TrimBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<DragTarget>(null)

  const timeFromX = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el || duration <= 0) return 0
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * duration
  }, [duration])

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current
    if (!el || duration <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const inX = (inPoint / duration) * rect.width
    const outX = (outPoint / duration) * rect.width
    const grab = 10 // px

    if (Math.abs(x - inX) <= grab) dragging.current = 'in'
    else if (Math.abs(x - outX) <= grab) dragging.current = 'out'
    else {
      dragging.current = 'playhead'
      onSeek(timeFromX(e.clientX))
    }
  }, [duration, inPoint, outPoint, onSeek, timeFromX])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = dragging.current
    if (!target) return
    const t = timeFromX(e.clientX)
    if (target === 'in') {
      const v = Math.min(t, outPoint - MIN_CLIP_SECS)
      onChangeIn(Math.max(0, v))
      onSeek(Math.max(0, v))
    } else if (target === 'out') {
      const v = Math.max(t, inPoint + MIN_CLIP_SECS)
      onChangeOut(Math.min(duration, v))
      onSeek(Math.min(duration, v))
    } else {
      onSeek(t)
    }
  }, [duration, inPoint, outPoint, onChangeIn, onChangeOut, onSeek, timeFromX])

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  return (
    <div
      ref={trackRef}
      className="relative h-10 select-none cursor-pointer touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Track */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-white/10" />

      {/* Excluded regions (dimmed) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-l-full bg-black/50"
        style={{ left: 0, width: `${pct(inPoint)}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-r-full bg-black/50"
        style={{ left: `${pct(outPoint)}%`, right: 0 }}
      />

      {/* Kept region */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-2 bg-accent-500/70"
        style={{ left: `${pct(inPoint)}%`, width: `${Math.max(0, pct(outPoint) - pct(inPoint))}%` }}
      />

      {/* Playhead */}
      <div
        className="absolute top-1 bottom-1 w-px bg-white pointer-events-none"
        style={{ left: `${pct(currentTime)}%` }}
      />

      {/* In / Out handles */}
      <div
        className="absolute top-0 bottom-0 w-3 -translate-x-1/2 flex items-center justify-center pointer-events-none"
        style={{ left: `${pct(inPoint)}%` }}
      >
        <div className="w-2.5 h-7 rounded-sm bg-accent-400 shadow-md" />
      </div>
      <div
        className="absolute top-0 bottom-0 w-3 -translate-x-1/2 flex items-center justify-center pointer-events-none"
        style={{ left: `${pct(outPoint)}%` }}
      >
        <div className="w-2.5 h-7 rounded-sm bg-accent-400 shadow-md" />
      </div>
    </div>
  )
}
