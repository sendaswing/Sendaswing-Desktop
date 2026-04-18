import { FrameCache } from './FrameCache'
import { FrameDecoder } from './FrameDecoder'
import { ChunkDemuxer, type SampleWithData } from './ChunkDemuxer'

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

  onFrameChange: ((frame: number) => void) | null = null
  onPlayStateChange: ((playing: boolean) => void) | null = null

  constructor() {
    this.decoder = new FrameDecoder(this.cache)
  }

  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
  }

  async load(fileBuffer: ArrayBuffer): Promise<ScrubberLoadResult> {
    this.stop()
    this.cache.clear()

    const result = await this.demuxer.load(fileBuffer)
    this.samples = result.samples
    this.fps = result.fps
    this.frameCount = this.samples.length

    await this.decoder.init(result.codecConfig)
    this.decoder.setFps(this.fps)

    if (this.samples.length > 0) {
      this.decoder.setFirstTimestampUs(this.samples[0].compositionTimestampUs)
    }

    await this.seekAsync(0)

    return {
      frameCount: this.frameCount,
      fps: this.fps,
      duration: result.duration,
      codedWidth: result.codecConfig.codedWidth,
      codedHeight: result.codecConfig.codedHeight
    }
  }

  private seekAsync(frameIndex: number): Promise<void> {
    const target = this.clamp(frameIndex)
    const cached = this.cache.get(target)
    if (cached) {
      this.renderBitmap(cached)
      this.currentFrame = target
      this.onFrameChange?.(target)
      this.prefetchAhead(target)
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
        this.prefetchAhead(target)
        resolve()
      })
    })
  }

  seek(frameIndex: number): void {
    const target = this.clamp(frameIndex)
    this.currentFrame = target
    const cached = this.cache.get(target)
    if (cached) {
      this.renderBitmap(cached)
      this.onFrameChange?.(target)
    } else {
      const kf = this.demuxer.findNearestKeyframe(target)
      this.decoder.reset()
      this.decoder.decodeFrom(this.samples, kf, target, () => {
        const bmp = this.cache.get(target)
        if (bmp) this.renderBitmap(bmp)
        this.onFrameChange?.(target)
      })
    }
    this.prefetchAhead(target)
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

  private prefetchAhead(frameIndex: number): void {
    if (typeof requestIdleCallback === 'undefined') return
    requestIdleCallback(() => {
      for (let i = frameIndex + 1; i <= frameIndex + 60 && i < this.frameCount; i++) {
        if (!this.cache.has(i)) {
          const kf = this.demuxer.findNearestKeyframe(i)
          this.decoder.decodeFrom(this.samples, kf, i, () => {})
          break
        }
      }
    }, { timeout: 200 })
  }

  private clamp(n: number): number {
    return Math.max(0, Math.min(n, this.frameCount - 1))
  }

  getCurrentFrame(): number { return this.currentFrame }
  getTotalFrames(): number { return this.frameCount }
  getFps(): number { return this.fps }

  dispose(): void {
    this.stop()
    this.decoder.dispose()
    this.cache.clear()
    this.demuxer.dispose()
  }
}
