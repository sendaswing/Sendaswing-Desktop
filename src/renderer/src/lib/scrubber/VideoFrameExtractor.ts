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

      // WebM from MediaRecorder reports Infinity duration — seek to MAX to discover real end
      let duration = video.duration
      if (!isFinite(duration) || duration === 0) {
        duration = await new Promise<number>((res) => {
          video.onseeked = () => { video.onseeked = null; res(video.currentTime) }
          video.currentTime = Number.MAX_SAFE_INTEGER
        })
      }
      if (duration === 0) throw new Error('no-duration')

      const fps = 30
      const frameCount = Math.min(Math.round(duration * fps), 1200)
      cache.resize(frameCount)

      if ('requestVideoFrameCallback' in (video as any)) {
        // Fast path: play at 2× and capture frames via requestVideoFrameCallback.
        // IMPORTANT: await each createImageBitmap before registering the next callback.
        // Firing them in parallel exhausts the Chrome capture buffer pool (3–5 entries),
        // causing "Failed to reserve output capture buffer" and breaking all video loading.
        video.currentTime = 0
        await new Promise<void>((res) => { video.onseeked = () => res() })
        video.playbackRate = 2

        await new Promise<void>((res) => {
          const onFrame = (_now: number, meta: any) => {
            const frameIdx = Math.min(Math.round((meta.mediaTime as number) * fps), frameCount - 1)
            try {
              // OffscreenCanvas.drawImage bypasses the GPU capture buffer pool entirely,
              // avoiding "Failed to reserve output capture buffer" errors on Windows.
              const oc = new OffscreenCanvas(video.videoWidth || 1280, video.videoHeight || 720)
              oc.getContext('2d')!.drawImage(video, 0, 0)
              cache.put(frameIdx, oc.transferToImageBitmap())
            } catch { /* skip frame if capture fails */ }
            onProgress?.(frameIdx / Math.max(frameCount - 1, 1))
            if (frameIdx >= frameCount - 1 || video.ended) { video.pause(); res(); return }
            ;(video as any).requestVideoFrameCallback(onFrame)
          }
          ;(video as any).requestVideoFrameCallback(onFrame)
          video.play().catch(() => res())
        })
      } else {
        // Fallback: sequential seek (~200–500 ms per frame, slow)
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
      }

      onProgress?.(1)
      return { frameCount, fps, duration, width: video.videoWidth, height: video.videoHeight }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}
