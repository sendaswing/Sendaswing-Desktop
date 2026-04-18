import React, { useRef, useEffect } from 'react'
import { useScrubber } from '../../hooks/useScrubber'
import { DrawingCanvas } from './DrawingCanvas'
import { ScrubberBar } from './ScrubberBar'
import { PlaybackControls } from './PlaybackControls'
import { useAnalysisStore } from '../../store/analysisStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

interface VideoPlayerProps {
  clipPath?: string | null
  showControls?: boolean
  onFrameChange?: (frame: number) => void
}

export function VideoPlayer({ clipPath, showControls = true, onFrameChange }: VideoPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isLoaded, loadClip, seek, play, pause, stepForward, stepBackward } = useScrubber(canvasRef)
  const { playbackSpeed, currentFrame, totalFrames } = useAnalysisStore()

  useEffect(() => {
    if (clipPath) loadClip(clipPath)
  }, [clipPath])

  useKeyboardShortcuts({
    onTogglePlay: () => {
      const { isPlaying } = useAnalysisStore.getState()
      if (isPlaying) pause()
      else play(playbackSpeed)
    },
    onStepForward: stepForward,
    onStepBackward: stepBackward,
    onPause: pause,
    onSeekForward: (n) => seek(Math.min(currentFrame + n, totalFrames - 1)),
    onSeekBackward: (n) => seek(Math.max(currentFrame - n, 0))
  })

  const handleSeek = (frame: number) => {
    seek(frame)
    onFrameChange?.(frame)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0 bg-black">
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
        {isLoaded && <DrawingCanvas />}
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm select-none">
            Select a clip to analyze
          </div>
        )}
      </div>

      {showControls && (
        <>
          <ScrubberBar onSeek={handleSeek} />
          <PlaybackControls
            onPlay={play}
            onPause={pause}
            onStepForward={stepForward}
            onStepBackward={stepBackward}
          />
        </>
      )}
    </div>
  )
}
