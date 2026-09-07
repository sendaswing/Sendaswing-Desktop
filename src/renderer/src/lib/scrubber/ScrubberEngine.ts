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

/** Seconds of video to keep decoded ahead of / behind the playhead. */
const PRELOAD_AHEAD_SECS = 3
const PRELOAD_BEHIND_SECS = 1

/**
 * ScrubberEngine — frame-accurate playback over a decoded-frame cache.
 *
 * Decoding is serialized through `runExclusive` so only one decode is ever in
 * flight. Seeks take priority: they abort the current preload (by resetting
 * the decoder and bumping `preloadGen`) and queue immediately behind it.
 *
 * Preloading is a rolling window around the playhead, sized to what the
 * memory-budgeted FrameCache can actually hold, instead of the whole clip.
 */
export class ScrubberEngine {
  private cache = new FrameCache()
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

  // Serialized decode queue
  private opChain: Promise<void> = Promise.resolve()
  private seekPending = false
  private pendingSeekTarget: number | null = null

  // Rolling preload window
  private preloadGen = 0
  private preloading = false
  private windowAhead = 0
  private windowBehind = 0
  private lastPreloadCenter = -1
  /** Frames the cache can hold at this clip's resolution, minus headroom. */
  private usableFrames = 8
  /** Range currently being decoded by a seek, if any. */
  private inflight: { start: number; end: number } | null = null
  /** True while the user is dragging the scrubber — preload is paused. */
  private scrubbing = false

  // Set when frames were captured via VideoFrameExtractor (no decoder available)
  private isWebmExtracted = false

  onFrameChange: ((frame: number) => void) | null = null
  onPlayStateChange: ((playing: boolean) => void) | null = null
  onPreloadProgress: ((pct: number) => void) | null = null

  constructor() {
    this.decoder = new FrameDecoder(this.cache)
    // Render the frame the user is on the instant it comes out of the decoder,
    // without waiting for the rest of its keyframe group.
    this.decoder.onFrameDecoded = (idx) => {
      if (idx !== this.currentFrame || this.isPlayingInternal) return
      const bmp = this.cache.get(idx)
      if (bmp) this.renderBitmap(bmp)
    }
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
    this.pendingSeekTarget = null
    this.seekPending = false

    try {
      const result = await this.demuxer.load(fileBuffer)
      this.samples = result.samples
      this.fps = result.fps
      this.frameCount = this.samples.length

      const { codedWidth, codedHeight } = result.codecConfig
      this.configureWindow(codedWidth, codedHeight)

      await this.decoder.init(result.codecConfig)
      this.decoder.setFps(this.fps)
      if (this.samples.length > 0) {
        this.decoder.setFirstTimestampUs(this.samples[0].compositionTimestampUs)
      }

      // Decode just the first frame so the user sees something immediately;
      // the rolling preload fills in around it afterwards.
      const first = Math.min(1, this.frameCount - 1)
      await this.seekExclusive(first)
      // Fill the initial window before reporting "loaded" so playback starts
      // smooth instead of stalling frame-by-frame (UI shows progress meanwhile).
      await this.schedulePreload(first)

      return {
        frameCount: this.frameCount,
        fps: this.fps,
        duration: result.duration,
        codedWidth,
        codedHeight
      }
    } catch {
      // Non-MP4 (WebM) or parse failure: extract frames via offscreen video element
      const extractor = new VideoFrameExtractor()
      const info = await extractor.extract(fileBuffer, this.cache, (pct) => this.onPreloadProgress?.(pct))
      this.frameCount = info.frameCount
      this.fps = info.fps
      this.isWebmExtracted = true

      const startFrame = Math.min(1, this.frameCount - 1)
      const bmp = this.cache.get(startFrame)
      if (bmp) this.renderBitmap(bmp)
      this.currentFrame = startFrame
      this.onFrameChange?.(startFrame)

      return {
        frameCount: info.frameCount,
        fps: info.fps,
        duration: info.duration,
        codedWidth: info.width,
        codedHeight: info.height
      }
    }
  }

  /** Size the preload window to fit comfortably inside the cache budget. */
  private configureWindow(width: number, height: number): void {
    const capacity = this.cache.capacityFor(width, height)
    // Leave ~20% headroom so preloading never evicts the frame being viewed.
    const usable = Math.max(8, Math.floor(capacity * 0.8))
    this.usableFrames = usable

    // Whole clip fits: preload all of it so scrubbing anywhere is instant.
    if (this.frameCount <= usable) {
      this.windowAhead = this.frameCount
      this.windowBehind = this.frameCount
      return
    }

    const wantAhead = Math.round(PRELOAD_AHEAD_SECS * this.fps)
    const wantBehind = Math.round(PRELOAD_BEHIND_SECS * this.fps)
    const total = wantAhead + wantBehind
    if (total <= usable) {
      this.windowAhead = wantAhead
      this.windowBehind = wantBehind
    } else {
      this.windowAhead = Math.max(4, Math.floor(usable * (wantAhead / total)))
      this.windowBehind = Math.max(2, usable - this.windowAhead)
    }
  }

  // --- Serialized decode queue ---

  private runExclusive(fn: () => Promise<void>): Promise<void> {
    const run = this.opChain.then(fn, fn)
    this.opChain = run.catch(() => {})
    return run
  }

  /**
   * Decode the keyframe group containing `target` — as much of it as fits in
   * memory — so the frames around the target are ready for the next scrub step.
   * The target itself renders via onFrameDecoded as soon as it appears.
   */
  private async decodeTo(target: number): Promise<void> {
    if (this.cache.has(target)) return
    const kf = this.demuxer.findNearestKeyframe(target)
    const kfs = this.demuxer.keyframeIndices
    let gopEnd = this.frameCount - 1
    for (const k of kfs) { if (k > kf) { gopEnd = k - 1; break } }
    // While scrubbing, keep each decode short (target + ~1 s) so the main thread
    // stays free for the next drag event; the full group fills in afterwards.
    const reach = this.scrubbing ? Math.round(this.fps) : this.usableFrames - 1
    const end = Math.max(target, Math.min(gopEnd, kf + reach, target + reach))

    this.inflight = { start: kf, end }
    try {
      // Resolves as soon as `target` is decoded; the rest of the group keeps
      // decoding in the background. No decoder reset — that's expensive.
      await this.decoder.decodeRange(this.samples, kf, end, target)
    } finally {
      this.inflight = null
    }
  }

  private seekExclusive(frameIndex: number): Promise<void> {
    const target = this.clamp(frameIndex)
    return this.runExclusive(async () => {
      await this.decodeTo(target)
      this.currentFrame = target
      const bmp = this.cache.get(target)
      if (bmp) this.renderBitmap(bmp)
      this.onFrameChange?.(target)
    })
  }

  // --- Rolling preload ---

  private cancelPreload(): void {
    this.preloadGen++
    this.preloading = false
  }

  /**
   * Preload keyframe groups that overlap [center - behind, center + ahead],
   * nearest-forward first. Each group is one exclusive decode so a seek can
   * slip in between groups.
   */
  private schedulePreload(center: number): Promise<void> {
    if (this.frameCount === 0 || this.isWebmExtracted || this.preloading) return Promise.resolve()

    const gen = ++this.preloadGen
    this.preloading = true
    this.lastPreloadCenter = center

    const lo = Math.max(0, center - this.windowBehind)
    const hi = Math.min(this.frameCount - 1, center + this.windowAhead)
    const kfs = this.demuxer.keyframeIndices
    const groups: Array<{ start: number; end: number }> = []
    for (let g = 0; g < kfs.length; g++) {
      const start = kfs[g]
      const end = g + 1 < kfs.length ? kfs[g + 1] - 1 : this.frameCount - 1
      if (end < lo || start > hi) continue
      groups.push({ start, end: Math.min(end, hi) })
    }
    // Forward groups first (in order), then backward groups nearest-first
    const forward = groups.filter((gr) => gr.end >= center)
    const backward = groups.filter((gr) => gr.end < center).reverse()
    const ordered = [...forward, ...backward]

    const totalFrames = Math.max(1, hi - lo + 1)
    let doneFrames = 0
    this.onPreloadProgress?.(0)

    const run = async () => {
      for (const gr of ordered) {
        if (gen !== this.preloadGen) return
        // Skip groups that are already fully cached
        let missing = false
        for (let i = gr.start; i <= gr.end; i++) {
          if (!this.cache.has(i)) { missing = true; break }
        }
        if (missing) {
          await this.runExclusive(async () => {
            if (gen !== this.preloadGen) return
            await this.decoder.decodeRange(this.samples, gr.start, gr.end)
          }).catch((e) => console.warn('[ScrubberEngine] preload decode failed', e))
        }
        if (gen !== this.preloadGen) return
        doneFrames += Math.max(0, Math.min(gr.end, hi) - Math.max(gr.start, lo) + 1)
        this.onPreloadProgress?.(Math.min(1, doneFrames / totalFrames))
      }
      if (gen === this.preloadGen) {
        this.preloading = false
        this.onPreloadProgress?.(1)
      }
    }

    return run()
  }

  /** Pause background preloading while the user drags the scrubber. */
  setScrubbing(active: boolean): void {
    if (this.scrubbing === active) return
    this.scrubbing = active
    if (active) {
      this.cancelPreload()
    } else {
      this.lastPreloadCenter = -1
      this.schedulePreload(this.currentFrame)
    }
  }

  /** Called from playback/seek paths to keep the window centered. */
  private maybePreload(center: number): void {
    if (this.preloading || this.isWebmExtracted || this.scrubbing) return
    if (center === this.lastPreloadCenter) return
    const probe = this.clamp(center + Math.floor(this.windowAhead / 2))
    if (!this.cache.has(probe) || !this.cache.has(this.clamp(center + 1))) {
      this.schedulePreload(center)
    }
  }

  // --- Public seek/play API ---

  seek(frameIndex: number): void {
    const target = this.clamp(frameIndex)
    this.currentFrame = target
    this.onFrameChange?.(target)

    const cached = this.cache.get(target)
    if (cached) {
      this.renderBitmap(cached)
      this.maybePreload(target)
      return
    }

    if (this.isWebmExtracted) return

    if (this.seekPending) {
      // A decode is in flight. If the new target is inside the range being
      // decoded, just wait — onFrameDecoded will render it. Otherwise abort
      // and let the seek loop pick up the new target.
      const r = this.inflight
      if (r && target >= r.start && target <= r.end) return
      this.pendingSeekTarget = target
      // Only abort (decoder reset = expensive reconfigure) when a big group is
      // in flight; small ones finish faster than a reset would.
      if (r && r.end - r.start > 30) this.decoder.reset()
      return
    }
    this.pendingSeekTarget = target
    this.seekPending = true

    // Stop scheduling more preload groups; whatever is queued is cheap to let
    // finish (a reset would force an expensive decoder reconfigure).
    this.cancelPreload()

    this.runExclusive(async () => {
      try {
        while (this.pendingSeekTarget !== null) {
          const t = this.pendingSeekTarget
          this.pendingSeekTarget = null
          try {
            await this.decodeTo(t)
          } catch (e) {
            console.warn('[ScrubberEngine] seek decode failed', e)
          }
          // Only render if the user hasn't moved on to another frame meanwhile
          if (this.currentFrame === t) {
            const bmp = this.cache.get(t)
            if (bmp) this.renderBitmap(bmp)
          }
        }
      } finally {
        this.seekPending = false
      }
      if (!this.scrubbing) this.schedulePreload(this.currentFrame)
    })
  }

  play(speed = 1): void {
    if (this.isPlayingInternal) {
      this.playbackSpeed = speed
      this.playStartFrame = this.currentFrame
      this.playStartTime = performance.now()
      return
    }
    // Restart from the beginning when play is pressed after reaching the end
    if (this.currentFrame >= this.frameCount - 1) {
      const restartFrame = Math.min(1, this.frameCount - 1)
      this.seek(restartFrame)
      this.currentFrame = restartFrame
    }
    this.isPlayingInternal = true
    this.playbackSpeed = speed
    this.playStartFrame = this.currentFrame
    this.playStartTime = performance.now()
    this.onPlayStateChange?.(true)
    this.maybePreload(this.currentFrame)
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
    this.seek(this.clamp(this.currentFrame + 1))
  }

  stepBackward(): void {
    this.pause()
    this.seek(this.clamp(this.currentFrame - 1))
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
        const bmp = this.cache.get(target)
        if (bmp) {
          this.currentFrame = target
          this.renderBitmap(bmp)
          this.onFrameChange?.(target)
          this.maybePreload(target)
        } else if (this.preloading) {
          // Frame not decoded yet: hold on the current frame while the preload
          // catches up, rather than restarting the decoder every tick.
          this.playStartFrame = this.currentFrame
          this.playStartTime = now
        } else {
          // Nothing in flight: decode on demand (seek() restarts the preload)
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
    this.pendingSeekTarget = null
    this.decoder.dispose()
    this.cache.clear()
    this.demuxer.dispose()
  }
}
