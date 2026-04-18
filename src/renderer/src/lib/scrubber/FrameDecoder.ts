import type { FrameCache } from './FrameCache'
import type { SampleWithData } from './ChunkDemuxer'

interface DecoderConfig {
  codec: string
  codedWidth: number
  codedHeight: number
  description?: Uint8Array
}

export class FrameDecoder {
  private decoder: VideoDecoder | null = null
  private cache: FrameCache
  private pendingCallbacks = new Map<number, () => void>()
  private config: DecoderConfig | null = null
  private fps = 30
  private sampleIndexByUs = new Map<number, number>()

  constructor(cache: FrameCache) {
    this.cache = cache
  }

  async init(config: DecoderConfig): Promise<void> {
    this.config = config

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => this.onFrame(frame),
      error: (e) => console.warn('[FrameDecoder]', e)
    })

    const codecStr = this.normalizeCodec(config.codec)
    const vcConfig: VideoDecoderConfig = {
      codec: codecStr,
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight
    }
    if (config.description?.byteLength) {
      vcConfig.description = config.description
    }

    const support = await VideoDecoder.isConfigSupported(vcConfig)
    if (!support.supported) {
      console.warn('[FrameDecoder] codec not supported:', codecStr, '— trying fallback avc1.42E01E')
      vcConfig.codec = 'avc1.42E01E'
      delete vcConfig.description
    }

    await this.decoder.configure(vcConfig)
  }

  private normalizeCodec(codec: string): string {
    if (!codec) return 'avc1.42E01E'
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

  decodeFrom(samples: SampleWithData[], startIndex: number, targetIndex: number, onDone: () => void): void {
    if (!this.decoder || samples.length === 0) { onDone(); return }

    const end = Math.min(targetIndex, samples.length - 1)
    this.sampleIndexByUs.clear()

    for (let i = startIndex; i <= end; i++) {
      const s = samples[i]
      if (!s?.data?.byteLength) continue

      this.sampleIndexByUs.set(s.compositionTimestampUs, i)

      const chunk = new EncodedVideoChunk({
        type: s.isKeyframe ? 'key' : 'delta',
        timestamp: s.compositionTimestampUs,
        data: s.data
      })

      this.decoder.decode(chunk)
    }

    if (targetIndex >= 0 && targetIndex < samples.length) {
      const targetUs = samples[targetIndex].compositionTimestampUs
      this.pendingCallbacks.set(targetUs, onDone)
    } else {
      onDone()
    }
  }

  private onFrame(frame: VideoFrame): void {
    const ts = frame.timestamp

    createImageBitmap(frame).then((bitmap) => {
      frame.close()
      const frameIdx = this.sampleIndexByUs.get(ts) ?? this.timestampUsToFrameIndex(ts)
      this.cache.put(frameIdx, bitmap)

      const cb = this.pendingCallbacks.get(ts)
      if (cb) {
        this.pendingCallbacks.delete(ts)
        cb()
      }
    })
  }

  private firstUs = -1

  setFirstTimestampUs(us: number): void {
    this.firstUs = us
  }

  private timestampUsToFrameIndex(us: number): number {
    if (this.firstUs < 0) this.firstUs = 0
    const deltaSecs = (us - this.firstUs) / 1_000_000
    return Math.round(deltaSecs * this.fps)
  }

  reset(): void {
    if (!this.decoder || this.decoder.state === 'closed') return
    this.decoder.reset()
    this.pendingCallbacks.clear()
    this.sampleIndexByUs.clear()

    if (this.config) {
      const vcConfig: VideoDecoderConfig = {
        codec: this.normalizeCodec(this.config.codec),
        codedWidth: this.config.codedWidth,
        codedHeight: this.config.codedHeight
      }
      if (this.config.description?.byteLength) vcConfig.description = this.config.description
      this.decoder.configure(vcConfig)
    }
  }

  dispose(): void {
    if (this.decoder?.state !== 'closed') this.decoder?.close()
    this.decoder = null
    this.pendingCallbacks.clear()
    this.sampleIndexByUs.clear()
  }
}
