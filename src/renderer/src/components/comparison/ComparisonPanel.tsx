import React, { useRef, useEffect, useCallback } from 'react'
import { useScrubber } from '../../hooks/useScrubber'
import { ScrubberBar } from '../analysis/ScrubberBar'
import { useAnalysisStore } from '../../store/analysisStore'
import { useComparisonStore } from '../../store/comparisonStore'
import { FolderOpen } from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import type { Clip } from '../../types/clip'
import { cn } from '../../lib/utils/cn'
import { formatTimecode } from '../../lib/utils/formatTime'

interface ComparisonPanelProps {
  side: 'left' | 'right'
}

export function ComparisonPanel({ side }: ComparisonPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isLoaded, loadClip, seek } = useScrubber(canvasRef)

  const { leftClip, rightClip, leftFrame, rightFrame, setLeftFrame, setRightFrame, isSynced } = useComparisonStore()
  const clip = side === 'left' ? leftClip : rightClip
  const frame = side === 'left' ? leftFrame : rightFrame
  const setFrame = side === 'left' ? setLeftFrame : setRightFrame

  useEffect(() => {
    if (clip) loadClip(clip.filePath)
  }, [clip?.id])

  const handleSeek = useCallback((f: number) => {
    setFrame(f)
    seek(f)

    if (isSynced) {
      const other = side === 'left' ? rightClip : leftClip
      if (other) {
        const ratio = f / Math.max(clip?.frameCount ?? 1, 1)
        const otherFrame = Math.round(ratio * (other.frameCount - 1))
        if (side === 'left') setRightFrame(otherFrame)
        else setLeftFrame(otherFrame)
      }
    }
  }, [isSynced, clip, leftClip, rightClip, setFrame, setLeftFrame, setRightFrame, seek, side])

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0 bg-black">
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
        {!isLoaded && (
          <ClipPicker side={side} />
        )}
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs font-mono text-white/60">
          {side.toUpperCase()}
        </div>
      </div>
      <ScrubberBar onSeek={handleSeek} />
    </div>
  )
}

function ClipPicker({ side }: { side: 'left' | 'right' }) {
  const clips = useClipStore((s) => s.clips)
  const { setLeftClip, setRightClip } = useComparisonStore()
  const set = side === 'left' ? setLeftClip : setRightClip

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30">
      <FolderOpen size={28} />
      <span className="text-sm">Select a clip for {side} panel</span>
      {clips.length > 0 && (
        <div className="flex flex-col gap-1 w-48">
          {clips.slice(0, 5).map((c) => (
            <button
              key={c.id}
              onClick={() => set(c)}
              className="text-left px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 truncate transition-colors"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
