import { useEffect, useRef, useState, useCallback } from 'react'
import { ScrubberEngine } from '../lib/scrubber/ScrubberEngine'
import { useAnalysisStore } from '../store/analysisStore'

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

  const store = useAnalysisStore()

  const frameChangeCb = options?.onFrameChange ?? store.setCurrentFrame
  const playStateCb = options?.onPlayStateChange ?? store.setIsPlaying
  const totalFramesCb = options?.onTotalFramesChange ?? store.setTotalFrames
  const fpsCb = options?.onFpsChange ?? store.setFps

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
    setPreloadProgress(0)

    try {
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

  const stepForward = useCallback(() => engineRef.current?.stepForward(), [])
  const stepBackward = useCallback(() => engineRef.current?.stepBackward(), [])

  return { isLoaded, loadFailed, preloadProgress, loadClip, seek, play, pause, stepForward, stepBackward, engineRef }
}
