import type { FrameCache } from './FrameCache'
import type { SampleWithData } from './ChunkDemuxer'

interface DecoderConfig {
  codec: string
  codedWidth: number
  codedHeight: number
  description?: Uint8Array
}

/**
 * FrameDecoder — thin wrapper over WebCodecs VideoDecoder that decodes a
 * contiguous range of samples (always starting at a keyframe) into the
 * FrameCache.
 *
 * Only ONE decodeRange() may be in flight at a time; ScrubberEngine serializes
 * calls. A reset() while a range is in flight aborts it: the pending flush
 * rejects, and any bitmaps still being created are discarded via `generation`.
 */
export class FrameDecoder {
  private decoder: VideoDecoder | null = null
  private cache: FrameCache
  private config: DecoderConfig | null = null
  private fps = 30
  private sampleIndexByUs = new Map<number, number>()
  private generation = 0
  private inflightBitmaps: Promise<void>[] = []
  private firstUs = -1

  /** Fired as soon as a decoded frame lands in the cache (used for instant render). */
  onFrameDecoded: ((frameIndex: number) => void) | null = null

  /** Callers waiting on frames from decodeRange(); resolved from onFrame. */
  private waiters = new Set<{ remaining: Set<number>; waitFor: number; done: () => void }>()

  constructor(cache: FrameCache) {
    this.cache = cache
  }

  async init(config: DecoderConfig): Promise<void> {
    this.generation++
    // Close any existing decoder before creating a new one to prevent accumulation
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close()
    this.sampleIndexByUs.clear()
    this.inflightBitmaps = []
    this.config = config

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => this.onFrame(frame),
      error: (e) => console.warn('[FrameDecoder]', e)
    })

    const vcConfig = this.buildConfig(config)
    const support = await VideoDecoder.isConfigSupported(vcConfig)
    if (!support.supported) {
      console.warn('[FrameDecoder] codec not supported:', vcConfig.codec, '— trying fallback avc1.42E01E')
      vcConfig.codec = 'avc1.42E01E'
    }

    this.decoder.configure(vcConfig)
  }

  private buildConfig(config: DecoderConfig): VideoDecoderConfig {
    const vcConfig: VideoDecoderConfig = {
      codec: this.normalizeCodec(config.codec),
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight
    }
    if (config.description?.byteLength) vcConfig.description = config.description
    return vcConfig
  }

  private normalizeCodec(codec: string): string {
    if (!codec) return 'avc1.42E01E'
    // Keep a fully-qualified codec string from the container (e.g. avc1.640028);
    // only substitute a generic one when the track gives us a bare name.
    if (/^avc[13]\.[0-9a-fA-F]{6}$/.test(codec)) return codec
    if (/^(hev1|hvc1)\..+/.test(codec)) return codec
    if (codec.startsWith('avc') || codec.startsWith('h264') || codec === 'H264') return 'avc1.42E01E'
    if (codec.startsWith('hev') || codec.startsWith('hvc')) return 'hev1.1.6.L93.B0'
    if (codec.startsWith('vp09') || codec.startsWith('vp9') || codec === 'VP9') return 'vp09.00.10.08'
    if (codec.startsWith('vp08') || codec.startsWith('vp8') || codec === 'VP8') return 'vp8'
    if (codec.startsWith('av01') || codec === 'AV1') return 'av01.0.08M.08'
    return codec
  }

  setFps(fps: number): void {
    this.fps = fps
  }

  setFirstTimestampUs(us: number): void {
    this.firstUs = us
  }

  /**
   * Decode samples[startIndex..endIndex] (inclusive) into the cache.
   * `startIndex` MUST be a keyframe.
   *
   * Resolves as soon as frame `waitFor` (default: endIndex) has landed in the
   * cache; the rest of the range keeps decoding in the background. No reset()
   * or flush() on the hot path — both are expensive on hardware decoders and
   * neither is needed when every range starts on a keyframe. flush() is only
   * used as a fallback if the decoder sits on frames without emitting them.
   */
  async decodeRange(samples: SampleWithData[], startIndex: number, endIndex: number, waitFor?: number): Promise<void> {
    const decoder = this.decoder
    if (!decoder || decoder.state !== 'configured' || samples.length === 0) return

    const end = Math.min(endIndex, samples.length - 1)
    const start = Math.max(0, startIndex)
    if (start > end) return
    const target = waitFor === undefined ? end : Math.max(start, Math.min(waitFor, end))

    const gen = this.generation
    const remaining = new Set<number>()

    for (let i = start; i <= end; i++) {
      const s = samples[i]
      if (!s?.data?.byteLength) continue
      if (this.cache.has(i) && i !== target) continue
      this.sampleIndexByUs.set(s.compositionTimestampUs, i)
      remaining.add(i)
      try {
        decoder.decode(new EncodedVideoChunk({
          type: s.isKeyframe ? 'key' : 'delta',
          timestamp: s.compositionTimestampUs,
          data: s.data
        }))
      } catch (e) {
        // Surface this: ScrubberEngine.load() falls back to the HTML5 extractor
        // when the very first decode fails (unsupported codec, missing avcC...).
        throw new Error(`decode failed at frame ${i}: ${String(e)}`)
      }
    }
    if (remaining.size === 0 || this.cache.has(target)) return

    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => { if (!settled) { settled = true; this.waiters.delete(waiter); resolve() } }
      const waiter = { remaining, waitFor: target, done: finish }
      this.waiters.add(waiter)

      // Fallback: if the target hasn't shown up in a reasonable time, force the
      // decoder to emit what it's holding. (Also covers reset()/close().)
      setTimeout(() => {
        if (settled) return
        if (this.generation !== gen || !this.decoder || this.decoder.state !== 'configured') { finish(); return }
        this.decoder.flush().then(finish, finish)
      }, 150)
    })
  }

  private onFrame(frame: VideoFrame): void {
    const ts = frame.timestamp
    const gen = this.generation

    const job = createImageBitmap(frame)
      .then((bitmap) => {
        if (this.generation !== gen) { bitmap.close(); return }
        const frameIdx = this.sampleIndexByUs.get(ts) ?? this.timestampUsToFrameIndex(ts)
        this.cache.put(frameIdx, bitmap)
        this.onFrameDecoded?.(frameIdx)
        for (const w of this.waiters) {
          w.remaining.delete(frameIdx)
          if (frameIdx === w.waitFor || w.remaining.size === 0) w.done()
        }
      })
      .catch(() => { /* bitmap creation failed — skip frame */ })
      .finally(() => frame.close())

    this.inflightBitmaps.push(job)
  }

  private timestampUsToFrameIndex(us: number): number {
    if (this.firstUs < 0) this.firstUs = 0
    const deltaSecs = (us - this.firstUs) / 1_000_000
    return Math.round(deltaSecs * this.fps)
  }

  /** Abort any in-flight decode and return the decoder to a clean state. */
  reset(): void {
    if (!this.decoder || this.decoder.state === 'closed') return
    this.generation++
    this.decoder.reset()
    this.sampleIndexByUs.clear()
    this.inflightBitmaps = []
    for (const w of Array.from(this.waiters)) w.done()
    if (this.config) this.decoder.configure(this.buildConfig(this.config))
  }

  dispose(): void {
    this.generation++
    if (this.decoder?.state !== 'closed') this.decoder?.close()
    this.decoder = null
    this.sampleIndexByUs.clear()
    this.inflightBitmaps = []
    for (const w of Array.from(this.waiters)) w.done()
  }
}
