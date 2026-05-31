import React, { useCallback } from 'react'
import { useVideoElement } from '../../hooks/useVideoElement'
import { DrawingCanvas } from './DrawingCanvas'
import { ScrubberBar } from './ScrubberBar'
import { PlaybackControls } from './PlaybackControls'
import { useAnalysisStore } from '../../store/analysisStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useEffect } from 'react'

interface VideoPlayerProps {
  clipPath?: string | null
  clipDuration?: number
}

export function VideoPlayer({ clipPath, clipDuration }: VideoPlayerProps) {
  const { attachVideo, isLoaded, loadFile, seekToFrame, play, pause, stepForward, stepBackward } = useVideoElement()
  const { playbackSpeed, currentFrame, totalFrames, fps, isPlaying } = useAnalysisStore()

  useEffect(() => {
    if (clipPath) loadFile(clipPath, clipDuration)
  }, [clipPath])

  const handleSeek = useCallback((frame: number) => {
    seekToFrame(frame, fps)
  }, [seekToFrame, fps])

  useKeyboardShortcuts({
    onTogglePlay: () => {
      if (isPlaying) pause()
      else play(playbackSpeed)
    },
    onStepForward: stepForward,
    onStepBackward: stepBackward,
    onPause: pause,
    onSeekForward: (n) => seekToFrame(Math.min(currentFrame + n, totalFrames - 1), fps),
    onSeekBackward: (n) => seekToFrame(Math.max(currentFrame - n, 0), fps)
  })

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
        <video
          ref={attachVideo}
          className="w-full h-full object-contain"
          playsInline
          preload="auto"
        />
        {clipPath && <DrawingCanvas />}
        {!clipPath && (
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm select-none">
            Select a clip from the left panel
          </div>
        )}
      </div>

      <ScrubberBar onSeek={handleSeek} />
      <PlaybackControls
        onPlay={play}
        onPause={pause}
        onStepForward={stepForward}
        onStepBackward={stepBackward}
      />
    </div>
  )
}
