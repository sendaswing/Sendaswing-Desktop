import { FrameCache } from './FrameCache'

export class VideoFrameExtractor {
  async extract(
    buffer: ArrayBuffer,
    cache: FrameCache,
    onProgress?: (pct: number) => void
  ): Promise<{ frameCount: number; fps: number; duration: number; width: number; height: number }> {
    const blob = new Blob([buffer])
    const url = URL.createObjectURL(blob)
    try {
      const video = document.createElement('video')
      video.src = url
      video.muted = true
      video.preload = 'auto'

      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res()
        video.onerror = () => rej(new Error('video-load-error'))
        video.load()
      })

      const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      if (duration === 0) throw new Error('no-duration')

      const fps = 30
      const frameCount = Math.min(Math.round(duration * fps), 1200)
      cache.resize(frameCount)

      // Capture frame 0 first so the canvas shows something immediately
      video.currentTime = 0
      await new Promise<void>((res) => { video.onseeked = () => res() })
      cache.put(0, await createImageBitmap(video))
      onProgress?.(1 / frameCount)

      for (let i = 1; i < frameCount; i++) {
        video.currentTime = i / fps
        await new Promise<void>((res) => { video.onseeked = () => res() })
        cache.put(i, await createImageBitmap(video))
        onProgress?.((i + 1) / frameCount)
      }

      onProgress?.(1)
      return { frameCount, fps, duration, width: video.videoWidth, height: video.videoHeight }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}
