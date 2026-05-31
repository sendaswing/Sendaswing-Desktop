import type { FrameSample } from '../../types/scrubber'

// @ts-ignore — mp4box has no bundled type declarations
import MP4Box from 'mp4box'

export interface DemuxResult {
  samples: SampleWithData[]
  fps: number
  duration: number
  codecConfig: { codec: string; description?: Uint8Array; codedWidth: number; codedHeight: number }
}

export interface SampleWithData {
  index: number
  timestamp: number
  compositionTimestampUs: number
  byteOffset: number
  byteLength: number
  isKeyframe: boolean
  data: Uint8Array
}

export class ChunkDemuxer {
  private _samples: SampleWithData[] = []
  private _fps = 30
  private _duration = 0
  private _keyframeIndices: number[] = []

  async load(fileBuffer: ArrayBuffer): Promise<DemuxResult> {
    // Fast WebM/EBML detection — bytes 0x1A 0x45 0xDF 0xA3
    const header = new Uint8Array(fileBuffer, 0, Math.min(12, fileBuffer.byteLength))
    if (header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3) {
      throw new Error('webm-format')
    }

    this._samples = []
    this._keyframeIndices = []

    const file = MP4Box.createFile()

    return new Promise((resolve, reject) => {
      let videoTrackId = -1
      let timescale = 1
      let codecConfig: DemuxResult['codecConfig'] = {
        codec: 'avc1.42E01E',
        codedWidth: 1920,
        codedHeight: 1080
      }

      file.onError = (e: any) => reject(new Error(`mp4box error: ${e}`))

      file.onReady = (info: any) => {
        const videoTrack = info.tracks?.find((t: any) => t.type === 'video')
        if (!videoTrack) { reject(new Error('No video track')); return }

        videoTrackId = videoTrack.id
        timescale = videoTrack.timescale ?? info.timescale ?? 1
        this._fps = videoTrack.nb_samples / (videoTrack.duration / timescale)
        this._duration = info.duration / (info.timescale ?? 1)

        codecConfig = {
          codec: videoTrack.codec ?? 'avc1.42E01E',
          codedWidth: videoTrack.video?.width ?? 1920,
          codedHeight: videoTrack.video?.height ?? 1080,
          description: extractAvcC(file, videoTrack.id)
        }

        file.setExtractionOptions(videoTrackId, null, { nbSamples: Infinity })
        file.start()
      }

      let sampleIndex = 0
      let totalExpected = 0

      file.onSamples = (_trackId: number, _ref: any, samples: any[]) => {
        if (totalExpected === 0) {
          const info = file.getInfo()
          const vt = info?.tracks?.find((t: any) => t.type === 'video')
          totalExpected = vt?.nb_samples ?? 0
        }

        for (const s of samples) {
          const ts = timescale > 0 ? (s.cts / timescale) : s.cts
          const isKeyframe = !!s.is_sync
          this._samples.push({
            index: sampleIndex,
            timestamp: ts,
            compositionTimestampUs: Math.round(ts * 1_000_000),
            byteOffset: s.offset ?? 0,
            byteLength: s.size ?? s.data?.byteLength ?? 0,
            isKeyframe,
            data: s.data instanceof Uint8Array ? s.data : new Uint8Array(s.data ?? [])
          })
          if (isKeyframe) this._keyframeIndices.push(sampleIndex)
          sampleIndex++
        }

        if (totalExpected > 0 && sampleIndex >= totalExpected) {
          resolve({
            samples: this._samples,
            fps: this._fps,
            duration: this._duration,
            codecConfig
          })
        }
      }

      const buf = fileBuffer.slice(0) as any
      buf.fileStart = 0
      file.appendBuffer(buf)
      file.flush()

      setTimeout(() => {
        if (this._samples.length > 0) {
          resolve({ samples: this._samples, fps: this._fps, duration: this._duration, codecConfig })
        } else {
          reject(new Error('parse-timeout: no samples decoded'))
        }
      }, 5000)
    })
  }

  findNearestKeyframe(frameIndex: number): number {
    const indices = this._keyframeIndices
    if (indices.length === 0) return 0
    let lo = 0, hi = indices.length - 1, result = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (indices[mid] <= frameIndex) { result = indices[mid]; lo = mid + 1 }
      else hi = mid - 1
    }
    return result
  }

  get samples(): SampleWithData[] {
    return this._samples
  }

  get frameCount(): number {
    return this._samples.length
  }

  get keyframeIndices(): number[] {
    return this._keyframeIndices
  }

  dispose(): void {
    this._samples = []
    this._keyframeIndices = []
  }
}

function extractAvcC(file: any, trackId: number): Uint8Array | undefined {
  try {
    const trak = file.getTrackById(trackId)
    const stsd = trak?.mdia?.minf?.stbl?.stsd
    if (!stsd) return undefined
    const entry = stsd.entries?.[0]
    if (!entry) return undefined
    const avcc = entry.avcC || entry.hvcC || entry.av1C
    if (!avcc) return undefined
    return undefined
  } catch {
    return undefined
  }
}
