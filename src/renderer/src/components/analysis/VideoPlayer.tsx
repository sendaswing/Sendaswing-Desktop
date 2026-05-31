import React, { useCallback, useRef, useEffect, useState } from 'react'
import { useScrubber } from '../../hooks/useScrubber'
import { useVideoElement } from '../../hooks/useVideoElement'
import { DrawingCanvas } from './DrawingCanvas'
import { ScrubberBar } from './ScrubberBar'
import { PlaybackControls } from './PlaybackControls'
import { useAnalysisStore } from '../../store/analysisStore'
import { useClipStore } from '../../store/clipStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import type { Clip } from '../../types/clip'

interface VideoPlayerProps {
  clipPath?: string | null
  clipDuration?: number
}

export function VideoPlayer({ clipPath, clipDuration }: VideoPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isLoaded, loadFailed, preloadProgress, loadClip, seek, play, pause, stepForward, stepBackward } = useScrubber(canvasRef)

  // HTML5 fallback for unsupported codecs
  const { attachVideo, isLoaded: html5Loaded, loadFile, seekToFrame, play: html5Play, pause: html5Pause, stepForward: html5StepForward, stepBackward: html5StepBackward } = useVideoElement()

  const { playbackSpeed, currentFrame, totalFrames, fps, isPlaying, setActiveClip } = useAnalysisStore()
  const { addClip } = useClipStore()
  const [isDragOver, setIsDragOver] = useState(false)

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    // Internal drag from ClipBrowser (text/plain = "filePath\nname")
    const text = e.dataTransfer.getData('text/plain')
    if (text) {
      const [filePath, name] = text.split('\n')
      if (filePath) {
        const existing = useClipStore.getState().clips.find((c) => c.filePath === filePath)
        if (existing) { setActiveClip(existing); return }
        const clip: Clip = {
          id: `drop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: name || filePath.split(/[\\/]/).pop()!,
          filePath,
          duration: 0, fps: 30, frameCount: 0, thumbnailPath: null,
          recordedAt: new Date().toISOString(),
          cameraLabel: 'Imported', cameraAngle: '', club: '', tags: [], annotations: []
        }
        addClip(clip)
        setActiveClip(clip)
        return
      }
    }

    // Native OS file drop
    const file = e.dataTransfer.files[0]
    const filePath = file && (file as any).path
    if (!filePath) return
    const clip: Clip = {
      id: `drop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      filePath,
      duration: 0, fps: 30, frameCount: 0, thumbnailPath: null,
      recordedAt: new Date().toISOString(),
      cameraLabel: 'Imported', cameraAngle: '', club: '', tags: [], annotations: []
    }
    addClip(clip)
    setActiveClip(clip)
  }, [addClip, setActiveClip])

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
      <div
        className={`relative flex-1 min-h-0 bg-black overflow-hidden transition-shadow ${isDragOver ? 'ring-2 ring-inset ring-accent-400/60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
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
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm select-none pointer-events-none">
            {isDragOver ? 'Drop to load' : 'Select a clip from the left panel or drop a file here'}
          </div>
        )}
        {clipPath && isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/60 text-sm select-none pointer-events-none">
            Drop to replace clip
          </div>
        )}
      </div>

      <ScrubberBar onSeek={handleSeek} onScrubStart={handlePause} preloadProgress={loadFailed ? 1 : preloadProgress} />
      <PlaybackControls
        onPlay={handlePlay}
        onPause={handlePause}
        onStepForward={handleStepForward}
        onStepBackward={handleStepBackward}
      />
    </div>
  )
}
