import { FrameCache } from './FrameCache'
import { FrameDecoder } from './FrameDecoder'
import { ChunkDemuxer, type SampleWithData } from './ChunkDemuxer'
import { VideoFrameExtractor } from './VideoFrameExtractor'

export interface ScrubberLoadResult {
  frameCount: number
  fps: number
  duration: number
  codedWidth: number
  codedHeight: number
}

export class ScrubberEngine {
  private cache = new FrameCache(180)
  private decoder: FrameDecoder
  private demuxer = new ChunkDemuxer()
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  private samples: SampleWithData[] = []
  private frameCount = 0
  private fps = 30
  private currentFrame = 0

  private rafId: number | null = null
  private isPlayingInternal = false
  private playbackSpeed = 1
  private playStartTime = 0
  private playStartFrame = 0

  private preloadIdleId: number | null = null

  // Pending seek queue: ensures only one decode is in flight at a time
  private seekInFlight = false
  private pendingSeekTarget: number | null = null

  // Set when frames were captured via VideoFrameExtractor (no decoder available)
  private isWebmExtracted = false

  onFrameChange: ((frame: number) => void) | null = null
  onPlayStateChange: ((playing: boolean) => void) | null = null
  onPreloadProgress: ((pct: number) => void) | null = null

  constructor() {
    this.decoder = new FrameDecoder(this.cache)
  }

  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
  }

  async load(fileBuffer: ArrayBuffer): Promise<ScrubberLoadResult> {
    this.stop()
    this.cancelPreload()
    this.cache.clear()
    this.isWebmExtracted = false
    this.seekInFlight = false
    this.pendingSeekTarget = null

    try {
      const result = await this.demuxer.load(fileBuffer)
      this.samples = result.samples
      this.fps = result.fps
      this.frameCount = this.samples.length

      this.cache.resize(Math.min(this.frameCount, 1200))

      await this.decoder.init(result.codecConfig)
      this.decoder.setFps(this.fps)

      if (this.samples.length > 0) {
        this.decoder.setFirstTimestampUs(this.samples[0].compositionTimestampUs)
      }

      await this.seekAsync(0)
      this.preloadAll()

      return {
        frameCount: this.frameCount,
        fps: this.fps,
        duration: result.duration,
        codedWidth: result.codecConfig.codedWidth,
        codedHeight: result.codecConfig.codedHeight
      }
    } catch {
      // Non-MP4 (WebM) or parse failure: extract frames via offscreen video element
      const extractor = new VideoFrameExtractor()
      const info = await extractor.extract(fileBuffer, this.cache, (pct) => this.onPreloadProgress?.(pct))
      this.frameCount = info.frameCount
      this.fps = info.fps
      this.isWebmExtracted = true

      const frame0 = this.cache.get(0)
      if (frame0) this.renderBitmap(frame0)
      this.currentFrame = 0
      this.onFrameChange?.(0)

      return {
        frameCount: info.frameCount,
        fps: info.fps,
        duration: info.duration,
        codedWidth: info.width,
        codedHeight: info.height
      }
    }
  }

  private cancelPreload(): void {
    if (this.preloadIdleId !== null && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(this.preloadIdleId)
      this.preloadIdleId = null
    }
  }

  private preloadAll(): void {
    if (typeof requestIdleCallback === 'undefined') return
    if (this.frameCount === 0 || this.isWebmExtracted) return

    const keyframeIndices = this.demuxer.keyframeIndices
    let kfGroupIdx = 0

    const step = (deadline: IdleDeadline) => {
      while (kfGroupIdx < keyframeIndices.length && deadline.timeRemaining() > 4) {
        const kfStart = keyframeIndices[kfGroupIdx]
        const kfEnd = kfGroupIdx + 1 < keyframeIndices.length
          ? keyframeIndices[kfGroupIdx + 1] - 1
          : this.frameCount - 1

        for (let i = kfStart; i <= kfEnd; i++) {
          if (!this.cache.has(i)) {
            this.decoder.decodeSequential(this.samples, i, keyframeIndices, () => {})
          }
        }

        kfGroupIdx++
        const lastFrameInGroup = kfEnd
        this.onPreloadProgress?.(Math.min(1, (lastFrameInGroup + 1) / this.frameCount))
      }

      if (kfGroupIdx < keyframeIndices.length) {
        this.preloadIdleId = requestIdleCallback(step, { timeout: 500 })
      } else {
        this.preloadIdleId = null
        this.onPreloadProgress?.(1)
      }
    }

    this.preloadIdleId = requestIdleCallback(step, { timeout: 500 })
  }

  private seekAsync(frameIndex: number): Promise<void> {
    const target = this.clamp(frameIndex)
    const cached = this.cache.get(target)
    if (cached) {
      this.renderBitmap(cached)
      this.currentFrame = target
      this.onFrameChange?.(target)
      return Promise.resolve()
    }

    if (this.isWebmExtracted) {
      this.currentFrame = target
      this.onFrameChange?.(target)
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const kf = this.demuxer.findNearestKeyframe(target)
      this.decoder.reset()
      this.decoder.decodeFrom(this.samples, kf, target, () => {
        this.currentFrame = target
        const bmp = this.cache.get(target)
        if (bmp) this.renderBitmap(bmp)
        this.onFrameChange?.(target)
        resolve()
      })
    })
  }

  seek(frameIndex: number): void {
    const target = this.clamp(frameIndex)
    this.currentFrame = target
    this.onFrameChange?.(target)

    const cached = this.cache.get(target)
    if (cached) {
      this.renderBitmap(cached)
      return
    }

    if (this.isWebmExtracted) return

    if (this.seekInFlight) {
      this.pendingSeekTarget = target
      return
    }
    this.startSeek(target)
  }

  private startSeek(target: number): void {
    this.cancelPreload()
    this.seekInFlight = true
    const kf = this.demuxer.findNearestKeyframe(target)
    this.decoder.reset()
    this.decoder.decodeFrom(this.samples, kf, target, () => {
      this.seekInFlight = false
      const bmp = this.cache.get(target)
      if (bmp) this.renderBitmap(bmp)

      if (this.pendingSeekTarget !== null) {
        const next = this.pendingSeekTarget
        this.pendingSeekTarget = null
        const nextCached = this.cache.get(next)
        if (nextCached) {
          this.currentFrame = next
          this.renderBitmap(nextCached)
          this.onFrameChange?.(next)
          this.preloadAll()
        } else {
          this.currentFrame = next
          this.onFrameChange?.(next)
          this.startSeek(next)
        }
      } else {
        this.preloadAll()
      }
    })
  }

  play(speed = 1): void {
    if (this.isPlayingInternal) {
      this.playbackSpeed = speed
      this.playStartFrame = this.currentFrame
      this.playStartTime = performance.now()
      return
    }
    this.isPlayingInternal = true
    this.playbackSpeed = speed
    this.playStartFrame = this.currentFrame
    this.playStartTime = performance.now()
    this.onPlayStateChange?.(true)
    this.tick()
  }

  pause(): void {
    this.isPlayingInternal = false
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
    this.onPlayStateChange?.(false)
  }

  stop(): void {
    this.pause()
    this.currentFrame = 0
  }

  stepForward(): void {
    this.pause()
    const next = this.clamp(this.currentFrame + 1)
    this.seek(next)
  }

  stepBackward(): void {
    this.pause()
    const prev = this.clamp(this.currentFrame - 1)
    this.seek(prev)
  }

  private tick(): void {
    if (!this.isPlayingInternal) return
    this.rafId = requestAnimationFrame((now) => {
      if (!this.isPlayingInternal) return
      const elapsed = (now - this.playStartTime) / 1000
      const target = this.clamp(Math.round(this.playStartFrame + elapsed * this.fps * this.playbackSpeed))

      if (target >= this.frameCount - 1) {
        this.seek(this.frameCount - 1)
        this.pause()
        return
      }

      if (target !== this.currentFrame) {
        this.currentFrame = target
        const bmp = this.cache.get(target)
        if (bmp) {
          this.renderBitmap(bmp)
          this.onFrameChange?.(target)
        } else {
          this.seek(target)
        }
      }
      this.tick()
    })
  }

  private renderBitmap(bmp: ImageBitmap): void {
    if (!this.ctx || !this.canvas) return
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.drawImage(bmp, 0, 0, this.canvas.width, this.canvas.height)
  }

  private clamp(n: number): number {
    return Math.max(0, Math.min(n, this.frameCount - 1))
  }

  getCurrentFrame(): number { return this.currentFrame }
  getTotalFrames(): number { return this.frameCount }
  getFps(): number { return this.fps }

  dispose(): void {
    this.stop()
    this.cancelPreload()
    this.decoder.dispose()
    this.cache.clear()
    this.demuxer.dispose()
  }
}
