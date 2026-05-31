import React, { useCallback, useRef, useEffect } from 'react'
import { useScrubber } from '../../hooks/useScrubber'
import { useVideoElement } from '../../hooks/useVideoElement'
import { DrawingCanvas } from './DrawingCanvas'
import { ScrubberBar } from './ScrubberBar'
import { PlaybackControls } from './PlaybackControls'
import { useAnalysisStore } from '../../store/analysisStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

interface VideoPlayerProps {
  clipPath?: string | null
  clipDuration?: number
}

export function VideoPlayer({ clipPath, clipDuration }: VideoPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isLoaded, loadFailed, preloadProgress, loadClip, seek, play, pause, stepForward, stepBackward } = useScrubber(canvasRef)

  // HTML5 fallback for unsupported codecs
  const { attachVideo, isLoaded: html5Loaded, loadFile, seekToFrame, play: html5Play, pause: html5Pause, stepForward: html5StepForward, stepBackward: html5StepBackward } = useVideoElement()

  const { playbackSpeed, currentFrame, totalFrames, fps, isPlaying } = useAnalysisStore()

  useEffect(() => {
    if (!clipPath) return
    if (loadFailed) {
      loadFile(clipPath, clipDuration)
    } else {
      loadClip(clipPath)
    }
  }, [clipPath, loadFailed])

  const handleSeek = useCallback((frame: number) => {
    if (loadFailed) seekToFrame(frame, fps)
    else seek(frame)
  }, [loadFailed, seekToFrame, seek, fps])

  const handlePlay = useCallback((speed: number) => {
    if (loadFailed) html5Play(speed)
    else play(speed)
  }, [loadFailed, html5Play, play])

  const handlePause = useCallback(() => {
    if (loadFailed) html5Pause()
    else pause()
  }, [loadFailed, html5Pause, pause])

  const handleStepForward = useCallback(() => {
    if (loadFailed) html5StepForward()
    else stepForward()
  }, [loadFailed, html5StepForward, stepForward])

  const handleStepBackward = useCallback(() => {
    if (loadFailed) html5StepBackward()
    else stepBackward()
  }, [loadFailed, html5StepBackward, stepBackward])

  useKeyboardShortcuts({
    onTogglePlay: () => {
      if (isPlaying) handlePause()
      else handlePlay(playbackSpeed)
    },
    onStepForward: handleStepForward,
    onStepBackward: handleStepBackward,
    onPause: handlePause,
    onSeekForward: (n) => handleSeek(Math.min(currentFrame + n, totalFrames - 1)),
    onSeekBackward: (n) => handleSeek(Math.max(currentFrame - n, 0))
  })

  const effectivelyLoaded = loadFailed ? html5Loaded : isLoaded

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
        {/* WebCodecs canvas — hidden when falling back to HTML5 */}
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-contain ${loadFailed ? 'hidden' : ''}`}
        />

        {/* HTML5 video fallback */}
        {loadFailed && (
          <video
            ref={attachVideo}
            className="w-full h-full object-contain"
            playsInline
            preload="auto"
          />
        )}

        {clipPath && effectivelyLoaded && <DrawingCanvas />}

        {!clipPath && (
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm select-none">
            Select a clip from the left panel
          </div>
        )}
      </div>

      <ScrubberBar onSeek={handleSeek} preloadProgress={loadFailed ? 1 : preloadProgress} />
      <PlaybackControls
        onPlay={handlePlay}
        onPause={handlePause}
        onStepForward={handleStepForward}
        onStepBackward={handleStepBackward}
      />
    </div>
  )
}
