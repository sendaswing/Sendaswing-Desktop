import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useScrubber } from '../../hooks/useScrubber'
import { ScrubberBar } from '../analysis/ScrubberBar'
import { useAnalysisStore } from '../../store/analysisStore'
import { useComparisonStore } from '../../store/comparisonStore'
import { FolderOpen, FolderSearch } from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import type { Clip } from '../../types/clip'
import { cn } from '../../lib/utils/cn'

interface ComparisonPanelProps {
  side: 'left' | 'right'
}

export function ComparisonPanel({ side }: ComparisonPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isLoaded, loadClip, seek } = useScrubber(canvasRef)

  const { leftClip, rightClip, leftFrame, rightFrame, setLeftFrame, setRightFrame, isSynced } = useComparisonStore()
  const clip = side === 'left' ? leftClip : rightClip
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
        {!isLoaded && <ClipPicker side={side} />}
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs font-mono text-white/60 select-none">
          {side.toUpperCase()}
        </div>
        {isLoaded && clip && (
          <div className="absolute top-2 right-2 flex gap-1">
            {clip.cameraAngle && (
              <span className="bg-accent-500/80 text-black text-xs font-bold px-1.5 py-0.5 rounded">{clip.cameraAngle}</span>
            )}
            {clip.club && (
              <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded">{clip.club}</span>
            )}
          </div>
        )}
      </div>
      <ScrubberBar onSeek={handleSeek} />
    </div>
  )
}

function ClipPicker({ side }: { side: 'left' | 'right' }) {
  const { clips, addClip } = useClipStore()
  const { setLeftClip, setRightClip } = useComparisonStore()
  const set = side === 'left' ? setLeftClip : setRightClip
  const [scanning, setScanning] = useState(false)

  const handleScanFolder = async () => {
    setScanning(true)
    try {
      const result = await (window as any).electronAPI?.fs.scanFolder()
      if (!result?.files?.length) return

      for (const f of result.files) {
        const clip: Clip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: f.name,
          filePath: f.filePath,
          duration: 0,
          fps: 30,
          frameCount: 0,
          thumbnailPath: null,
          recordedAt: new Date().toISOString(),
          cameraLabel: 'Scanned',
          cameraAngle: '',
          club: '',
          tags: [],
          annotations: []
        }
        addClip(clip)
      }
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30 p-4">
      <span className="text-sm">Select a clip — {side} panel</span>

      <div className="flex gap-2">
        <button
          onClick={handleScanFolder}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
        >
          <FolderSearch size={13} />
          {scanning ? 'Scanning…' : 'Scan Folder'}
        </button>
      </div>

      {clips.length > 0 && (
        <div className="flex flex-col gap-1 w-56 max-h-48 overflow-y-auto">
          {clips.map((c) => (
            <button
              key={c.id}
              onClick={() => set(c)}
              className="text-left px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors flex items-center gap-2"
            >
              <span className="truncate flex-1">{c.name}</span>
              {c.cameraAngle && (
                <span className="text-accent-400 font-mono shrink-0">{c.cameraAngle}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
