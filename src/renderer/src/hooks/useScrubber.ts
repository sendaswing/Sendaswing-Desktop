import { useEffect, useRef, useState, useCallback } from 'react'
import { ScrubberEngine } from '../lib/scrubber/ScrubberEngine'
import { useAnalysisStore } from '../store/analysisStore'

/** Files above this get a warning; above MAX_BYTES the main process refuses them. */
export const WARN_FILE_BYTES = 250 * 1024 * 1024
export const MAX_FILE_BYTES = 1024 * 1024 * 1024

export interface SizeNotice {
  kind: 'warn' | 'blocked'
  bytes: number
}

export function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

interface UseScrubberOptions {
  onFrameChange?: (frame: number) => void
  onPlayStateChange?: (playing: boolean) => void
  onTotalFramesChange?: (n: number) => void
  onFpsChange?: (fps: number) => void
}

export function useScrubber(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options?: UseScrubberOptions
) {
  const engineRef = useRef<ScrubberEngine | null>(null)
  const loadSeqRef = useRef(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sizeNotice, setSizeNotice] = useState<SizeNotice | null>(null)

  // Subscribe to the actions only (stable references) so this hook never
  // re-renders its host on every frame change.
  const setCurrentFrame = useAnalysisStore((s) => s.setCurrentFrame)
  const setIsPlaying = useAnalysisStore((s) => s.setIsPlaying)
  const setTotalFrames = useAnalysisStore((s) => s.setTotalFrames)
  const setFps = useAnalysisStore((s) => s.setFps)

  const frameChangeCb = options?.onFrameChange ?? setCurrentFrame
  const playStateCb = options?.onPlayStateChange ?? setIsPlaying
  const totalFramesCb = options?.onTotalFramesChange ?? setTotalFrames
  const fpsCb = options?.onFpsChange ?? setFps

  useEffect(() => {
    const engine = new ScrubberEngine()
    engineRef.current = engine

    engine.onFrameChange = frameChangeCb
    engine.onPlayStateChange = playStateCb
    engine.onPreloadProgress = (pct) => setPreloadProgress(pct)

    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (canvasRef.current && engineRef.current) {
      engineRef.current.setCanvas(canvasRef.current)
    }
  }, [canvasRef.current])

  const loadClip = useCallback(async (filePath: string) => {
    if (!engineRef.current) return
    const seq = ++loadSeqRef.current
    setIsLoaded(false)
    setLoadFailed(false)
    setSizeNotice(null)
    setPreloadProgress(0)

    try {
      // Size guard: refuse anything over the hard cap, warn above the soft cap.
      const bytes: number = await (window as any).electronAPI.fs.fileSize(filePath)
      if (seq !== loadSeqRef.current) return
      if (bytes > MAX_FILE_BYTES) {
        setSizeNotice({ kind: 'blocked', bytes })
        setPreloadProgress(1)
        return
      }
      if (bytes > WARN_FILE_BYTES) setSizeNotice({ kind: 'warn', bytes })

      const buffer: ArrayBuffer = await (window as any).electronAPI.fs.readFileAsBuffer(filePath)
      if (seq !== loadSeqRef.current) return

      const result = await engineRef.current.load(buffer)
      if (seq !== loadSeqRef.current) return

      totalFramesCb(result.frameCount)
      fpsCb(result.fps)
      if (canvasRef.current) {
        canvasRef.current.width = result.codedWidth
        canvasRef.current.height = result.codedHeight
      }

      setIsLoaded(true)
      engineRef.current.play(0.5)
    } catch (err) {
      if (seq !== loadSeqRef.current) return
      if (String(err).includes('file-too-large')) {
        setSizeNotice({ kind: 'blocked', bytes: MAX_FILE_BYTES })
        setPreloadProgress(1)
        return
      }
      console.warn('[useScrubber] WebCodecs load failed, falling back to HTML5:', err)
      setLoadFailed(true)
      setPreloadProgress(1)
    }
  }, [totalFramesCb, fpsCb])

  const seek = useCallback((frame: number) => {
    engineRef.current?.seek(frame)
  }, [])

  const play = useCallback((speed: number) => {
    engineRef.current?.play(speed)
  }, [])

  const pause = useCallback(() => {
    engineRef.current?.pause()
  }, [])

  const setScrubbing = useCallback((active: boolean) => engineRef.current?.setScrubbing(active), [])
  const stepForward = useCallback(() => engineRef.current?.stepForward(), [])
  const stepBackward = useCallback(() => engineRef.current?.stepBackward(), [])

  return { isLoaded, loadFailed, sizeNotice, preloadProgress, loadClip, seek, play, pause, setScrubbing, stepForward, stepBackward, engineRef }
}
