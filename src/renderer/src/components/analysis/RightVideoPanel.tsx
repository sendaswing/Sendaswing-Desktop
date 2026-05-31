import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useScrubber } from '../../hooks/useScrubber'
import { useVideoElement } from '../../hooks/useVideoElement'
import { ScrubberBar } from './ScrubberBar'
import { PlaybackControls } from './PlaybackControls'
import { DrawingCanvas } from './DrawingCanvas'
import { useComparisonStore } from '../../store/comparisonStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { useClipStore } from '../../store/clipStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { Clip } from '../../types/clip'
import type { Annotation, AnnotationLayer } from '../../types/drawing'
import { FolderSearch, FolderOpen } from 'lucide-react'

const mkDefaultLayer = (): AnnotationLayer => ({ id: 'right-default', name: 'Layer 1', annotations: [], visible: true })

function makeDropClip(filePath: string, name: string, prefix: string): Clip {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    filePath,
    duration: 0, fps: 30, frameCount: 0, thumbnailPath: null,
    recordedAt: new Date().toISOString(),
    cameraLabel: 'Imported', cameraAngle: '', club: '', tags: [], annotations: []
  }
}

export function RightVideoPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Local state — independent from analysisStore
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [fps, setFps] = useState(30)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [annotations, setAnnotations] = useState<AnnotationLayer[]>([mkDefaultLayer()])
  const [isDragOver, setIsDragOver] = useState(false)

  const { isLoaded, loadFailed, preloadProgress, loadClip, seek, play, pause, stepForward, stepBackward } = useScrubber(canvasRef, {
    onFrameChange: setCurrentFrame,
    onPlayStateChange: setIsPlaying,
    onTotalFramesChange: setTotalFrames,
    onFpsChange: setFps
  })

  const { attachVideo, isLoaded: html5Loaded, loadFile, seekToFrame, play: html5Play, pause: html5Pause, stepForward: html5StepForward, stepBackward: html5StepBackward } = useVideoElement()

  const { rightClip, setRightClip, isSynced, leftFrame } = useComparisonStore()
  const { activeClip } = useAnalysisStore()
  const { addClip } = useClipStore()

  useEffect(() => {
    if (!rightClip) return
    setCurrentFrame(0)
    setTotalFrames(0)
    setAnnotations([mkDefaultLayer()])
    if (loadFailed) {
      loadFile(rightClip.filePath)
    } else {
      loadClip(rightClip.filePath)
    }
  }, [rightClip?.id, loadFailed])

  const handleSeek = useCallback((frame: number) => {
    if (loadFailed) seekToFrame(frame, fps)
    else seek(frame)
    setCurrentFrame(frame)
  }, [loadFailed, seekToFrame, seek, fps])

  const handlePlay = useCallback((speed: number) => {
    setPlaybackSpeed(speed)
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
        setRightClip(existing ?? makeDropClip(filePath, name || filePath.split('/').pop()!, 'drop-r'))
        return
      }
    }

    // Native OS file drop
    const file = e.dataTransfer.files[0]
    const filePath = file && (file as any).path
    if (!filePath) return
    const clip = makeDropClip(filePath, file.name, 'drop-r')
    addClip(clip)
    setRightClip(clip)
  }, [addClip, setRightClip])

  // Sync effect — mirror left panel scrub position to right panel
  useEffect(() => {
    if (!isSynced || !rightClip || totalFrames === 0) return
    const leftTotal = activeClip?.frameCount ?? 1
    const ratio = leftFrame / Math.max(leftTotal - 1, 1)
    const syncedFrame = Math.round(ratio * (totalFrames - 1))
    if (syncedFrame !== currentFrame) handleSeek(syncedFrame)
  }, [leftFrame, isSynced])

  const handleAddAnnotation = useCallback((ann: Annotation) => {
    setAnnotations((prev) =>
      prev.map((l) =>
        l.id === 'right-default' ? { ...l, annotations: [...l.annotations, ann] } : l
      )
    )
  }, [])

  const effectivelyLoaded = loadFailed ? html5Loaded : isLoaded

  return (
    <div className="flex flex-col h-full">
      <div
        className={`relative flex-1 min-h-0 bg-black overflow-hidden transition-shadow ${isDragOver ? 'ring-2 ring-inset ring-accent-400/60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-contain ${loadFailed ? 'hidden' : ''}`}
        />

        {loadFailed && (
          <video
            ref={attachVideo}
            className="w-full h-full object-contain"
            playsInline
            preload="auto"
          />
        )}

        {rightClip && effectivelyLoaded && (
          <DrawingCanvas
            annotations={annotations}
            onAddAnnotation={handleAddAnnotation}
            frameIndex={currentFrame}
          />
        )}

        {!rightClip && <RightClipPicker />}

        {rightClip && isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/60 text-sm select-none pointer-events-none">
            Drop to replace clip
          </div>
        )}

        {rightClip && effectivelyLoaded && (
          <div className="absolute top-2 right-2 flex gap-1">
            {rightClip.cameraAngle && (
              <span className="bg-accent-500/80 text-black text-xs font-bold px-1.5 py-0.5 rounded">{rightClip.cameraAngle}</span>
            )}
            {rightClip.club && (
              <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded">{rightClip.club}</span>
            )}
          </div>
        )}

        {rightClip && !effectivelyLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">Loading…</div>
        )}
      </div>

      <ScrubberBar
        onSeek={handleSeek}
        onScrubStart={handlePause}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        preloadProgress={loadFailed ? 1 : preloadProgress}
      />
      <PlaybackControls
        onPlay={handlePlay}
        onPause={handlePause}
        onStepForward={handleStepForward}
        onStepBackward={handleStepBackward}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        currentFrame={currentFrame}
        fps={fps}
        totalFrames={totalFrames}
        onSetPlaybackSpeed={setPlaybackSpeed}
      />
    </div>
  )
}

function RightClipPicker() {
  const { clips, addClip } = useClipStore()
  const { setRightClip } = useComparisonStore()
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
          duration: 0, fps: 30, frameCount: 0, thumbnailPath: null,
          recordedAt: new Date().toISOString(),
          cameraLabel: 'Scanned', cameraAngle: '', club: '', tags: [], annotations: []
        }
        addClip(clip)
      }
    } finally {
      setScanning(false)
    }
  }

  const handleOpenFile = async () => {
    const { libraryDir } = useSettingsStore.getState()
    const paths: string[] = await (window as any).electronAPI?.fs.openVideo(libraryDir || undefined) ?? []
    if (!paths.length) return
    for (const filePath of paths) {
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      const clip: Clip = {
        id: `open-r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        filePath,
        duration: 0, fps: 30, frameCount: 0, thumbnailPath: null,
        recordedAt: new Date().toISOString(),
        cameraLabel: 'Imported', cameraAngle: '', club: '', tags: [], annotations: []
      }
      addClip(clip)
      setRightClip(clip)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30 p-4">
      <span className="text-sm">Select a comparison clip</span>
      <div className="flex gap-2">
        <button
          onClick={handleOpenFile}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          <FolderOpen size={13} /> Open File
        </button>
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
              onClick={() => setRightClip(c)}
              className="text-left px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors flex items-center gap-2"
            >
              <span className="truncate flex-1">{c.name}</span>
              {c.cameraAngle && <span className="text-accent-400 font-mono shrink-0">{c.cameraAngle}</span>}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-white/20 mt-1">or drag a clip from the left panel</p>
    </div>
  )
}
