import { useRef, useState, useCallback, useEffect } from 'react'
import { useAnalysisStore } from '../store/analysisStore'

export function useVideoElement() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const fallbackDurationRef = useRef<number>(0)
  const [isLoaded, setIsLoaded] = useState(false)

  const { setCurrentFrame, setTotalFrames, setFps, setIsPlaying } = useAnalysisStore()

  const loadFile = useCallback(async (filePath: string, fallbackDuration?: number) => {
    setIsLoaded(false)
    setCurrentFrame(0)
    fallbackDurationRef.current = fallbackDuration ?? 0

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    const buffer: ArrayBuffer = await (window as any).electronAPI.fs.readFileAsBuffer(filePath)
    const blob = new Blob([buffer])
    const url = URL.createObjectURL(blob)
    blobUrlRef.current = url

    const video = videoRef.current
    if (!video) return

    video.src = url
    video.load()
  }, [])

  const seekToFrame = useCallback((frame: number, fps: number) => {
    const video = videoRef.current
    if (!video || !isLoaded) return
    setCurrentFrame(frame)
    video.currentTime = frame / fps
  }, [isLoaded])

  const play = useCallback((speed: number) => {
    const video = videoRef.current
    if (!video) return
    if (video.ended) video.currentTime = 0
    video.playbackRate = speed
    video.play()
  }, [])

  const pause = useCallback(() => {
    videoRef.current?.pause()
  }, [])

  const stepForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const fps = useAnalysisStore.getState().fps
    video.pause()
    const totalFrames = useAnalysisStore.getState().totalFrames
    video.currentTime = Math.min(totalFrames / fps, video.currentTime + 1 / fps)
  }, [])

  const stepBackward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const fps = useAnalysisStore.getState().fps
    video.pause()
    video.currentTime = Math.max(0, video.currentTime - 1 / fps)
  }, [])

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    if (!el || videoRef.current === el) return
    videoRef.current = el

    el.onloadedmetadata = () => {
      const fps = 30
      // WebM from MediaRecorder has no duration in header → falls back to recorded wall-clock duration
      const rawDuration = el.duration
      const duration = isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : fallbackDurationRef.current

      const frames = duration > 0 ? Math.round(duration * fps) : 0
      setFps(fps)
      setTotalFrames(frames)
      setIsLoaded(true)
    }

    el.ontimeupdate = () => {
      const { fps } = useAnalysisStore.getState()
      setCurrentFrame(Math.round(el.currentTime * fps))
    }

    el.onplay = () => setIsPlaying(true)
    el.onpause = () => setIsPlaying(false)
    el.onended = () => setIsPlaying(false)
  }, [])

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  return { attachVideo, isLoaded, loadFile, seekToFrame, play, pause, stepForward, stepBackward }
}
