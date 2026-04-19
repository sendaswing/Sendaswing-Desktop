import { useEffect, useRef, useState, useCallback } from 'react'
import { ScrubberEngine } from '../lib/scrubber/ScrubberEngine'
import { useAnalysisStore } from '../store/analysisStore'

export function useScrubber(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const engineRef = useRef<ScrubberEngine | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const { setCurrentFrame, setTotalFrames, setFps, setIsPlaying } = useAnalysisStore()

  useEffect(() => {
    const engine = new ScrubberEngine()
    engineRef.current = engine

    engine.onFrameChange = (frame) => setCurrentFrame(frame)
    engine.onPlayStateChange = (playing) => setIsPlaying(playing)

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
    setIsLoaded(false)

    const buffer: ArrayBuffer = await (window as any).electronAPI.fs.readFileAsBuffer(filePath)
    const result = await engineRef.current.load(buffer)

    setTotalFrames(result.frameCount)
    setFps(result.fps)
    if (canvasRef.current) {
      canvasRef.current.width = result.codedWidth
      canvasRef.current.height = result.codedHeight
    }

    setIsLoaded(true)
  }, [])

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

  return { isLoaded, loadClip, seek, play, pause, stepForward, stepBackward, engineRef }
}
