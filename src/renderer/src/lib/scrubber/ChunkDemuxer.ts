import type { FrameSample } from '../../types/scrubber'

// mp4box is loaded via CDN script tag to avoid worker/WASM complications in Electron
const MP4BOX_CDN = 'https://cdn.jsdelivr.net/npm/mp4box@0.5.3/dist/mp4box.all.min.js'

let mp4boxPromise: Promise<any> | null = null

function getMp4box(): Promise<any> {
  if ((window as any).MP4Box) return Promise.resolve((window as any).MP4Box)
  if (mp4boxPromise) return mp4boxPromise

  mp4boxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = MP4BOX_CDN
    script.onload = () => resolve((window as any).MP4Box)
    script.onerror = () => reject(new Error('Failed to load mp4box'))
    document.head.appendChild(script)
  })
  return mp4boxPromise
}

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

  async load(fileBuffer: ArrayBuffer): Promise<DemuxResult> {
    this._samples = []

    const MP4Box = await getMp4box()
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
          this._samples.push({
            index: sampleIndex++,
            timestamp: ts,
            compositionTimestampUs: Math.round(ts * 1_000_000),
            byteOffset: s.offset ?? 0,
            byteLength: s.size ?? s.data?.byteLength ?? 0,
            isKeyframe: !!s.is_sync,
            data: s.data instanceof Uint8Array ? s.data : new Uint8Array(s.data ?? [])
          })
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

      // Fallback resolve after 5 seconds in case onSamples count is off
      setTimeout(() => {
        if (this._samples.length > 0) {
          resolve({ samples: this._samples, fps: this._fps, duration: this._duration, codecConfig })
        }
      }, 5000)
    })
  }

  findNearestKeyframe(frameIndex: number): number {
    let nearest = 0
    for (let i = 0; i <= frameIndex && i < this._samples.length; i++) {
      if (this._samples[i]?.isKeyframe) nearest = i
    }
    return nearest
  }

  get samples(): SampleWithData[] {
    return this._samples
  }

  get frameCount(): number {
    return this._samples.length
  }

  dispose(): void {
    this._samples = []
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
    const bytes: number[] = []
    const tmpBuf = { buffer: bytes }
    try {
      // serialize avcC box — mp4box boxes have a .write method
      avcc.write?.({ buffer: new ArrayBuffer(1024), pos: 0 })
    } catch {}
    return undefined
  } catch {
    return undefined
  }
}
