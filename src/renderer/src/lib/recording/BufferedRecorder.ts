/**
 * BufferedRecorder — keeps the last few seconds of one camera in memory so a
 * swing can be saved AFTER it happens (pre-roll), V1/GolfTec style.
 *
 * One WebCodecs H.264 encoder per camera runs for as long as the buffer is
 * armed. Frames are pulled straight off the camera track, encoded once, and
 * the encoded chunks go into a rolling list that is trimmed (at a keyframe)
 * to a little more than the pre-roll. A keyframe is forced every
 * KEYFRAME_SEC so the saved clip can always start just before the pre-roll.
 *
 * On a trigger we wait out the post-roll, slice [keyframe <= trigger − pre ..
 * trigger + post] from the list, wrap it in a small Matroska file, and hand
 * it back with where the trigger falls inside it. The main process trims,
 * flips and converts it with ffmpeg. Buffering never stops, so the next swing
 * is already covered.
 *
 * Why not MediaRecorder: it can't drop old data, so the old version ran 2–3
 * overlapping recorders per camera and started a new one every ~1.5 s. With
 * two 1080p/60 cameras that was 4–6 encoders plus constant encoder churn; the
 * camera ran out of capture buffers and the live preview fell to ~28 fps
 * ("Failed to reserve output capture buffer" in the console).
 */

interface StoredChunk {
  key: boolean
  /** Encoder timestamp in µs (camera clock). */
  ts: number
  /** The same moment on the performance.now() clock, in ms. */
  at: number
  data: Uint8Array
}

export interface BufferedSegment {
  blob: Blob
  ext: 'mkv'
  /** Seconds into the blob where the saved clip should start. */
  startSec: number
  /** Seconds to keep from startSec. */
  durationSec: number
  /** Frame rate measured from the frames actually captured (0 if unknown). */
  fps: number
}

/**
 * Container type for MediaRecorder (Standard mode recording). Kept here
 * because other recording code imports it from this module.
 */
export function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm'
  ]
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm'
}

// High / Main / Baseline, level 5.1 (covers 1080p at 120 fps)
const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.42e033']
// Source quality for the ffmpeg re-encode; high-fps cameras need the headroom
const BITRATE = 16_000_000
const KEYFRAME_SEC = 0.5
// If the encoder falls this far behind, skip frames rather than build up lag
const MAX_ENCODE_QUEUE = 4

export class BufferedRecorder {
  private track: MediaStreamTrack | null
  private nominalFps: number
  private keepMs: number
  private keyEvery: number

  private running = false
  private stopRequested = false
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null

  private encoder: VideoEncoder | null = null
  private candidates: VideoEncoderConfig[] = []
  private candidateIdx = 0
  private configuring = false
  private encW = 0
  private encH = 0
  private description: Uint8Array | null = null
  private framesSinceKey = 0
  private needKey = true
  private failed: string | null = null

  private chunks: StoredChunk[] = []
  /** performance.now() − frame timestamp; the smallest seen ≈ capture time. */
  private clockOffsetMs = Infinity
  /** wantStart of every capture in flight — never trim past these. */
  private holds: number[] = []
  private droppedFrames = 0

  constructor(stream: MediaStream, preRollSec: number, fps = 60) {
    // Our own clone, so stopping the buffer never touches the live preview
    this.track = stream.getVideoTracks()[0]?.clone() ?? null
    this.nominalFps = fps > 0 ? fps : 60
    // Pre-roll plus one keyframe interval plus slack for timer jitter
    this.keepMs = (preRollSec + KEYFRAME_SEC + 0.75) * 1000
    this.keyEvery = Math.max(1, Math.round(this.nominalFps * KEYFRAME_SEC))
  }

  start(): void {
    if (this.running) return
    if (!this.track) { this.failed = 'Camera has no video track'; return }
    const Processor = (window as any).MediaStreamTrackProcessor
    if (typeof Processor !== 'function' || typeof VideoEncoder !== 'function') {
      this.failed = 'This build of Electron has no WebCodecs capture support'
      return
    }
    this.running = true
    const processor = new Processor({ track: this.track })
    this.reader = (processor.readable as ReadableStream<VideoFrame>).getReader()
    void this.pump()
  }

  /** Stops buffering. A capture already in flight is allowed to finish first. */
  stop(): void {
    this.stopRequested = true
    if (!this.holds.length) this.teardown()
  }

  /** Seconds of history currently available (for the "buffer ready" indicator). */
  bufferedSec(): number {
    if (this.chunks.length < 2) return 0
    return (this.chunks[this.chunks.length - 1].at - this.chunks[0].at) / 1000
  }

  /**
   * Save the swing whose impact happened at `triggerAt` (performance.now()).
   * Resolves after the post-roll has been recorded.
   */
  capture(triggerAt: number, preRollSec: number, postRollSec: number): Promise<BufferedSegment> {
    if (this.failed) return Promise.reject(new Error(this.failed))
    if (!this.running || this.stopRequested) return Promise.reject(new Error('Camera buffer is not running'))
    if (!this.chunks.length || !this.description) {
      return Promise.reject(new Error('Camera buffer is not running yet'))
    }

    const wantStart = triggerAt - preRollSec * 1000
    const stopAt = triggerAt + postRollSec * 1000
    this.holds.push(wantStart)

    return new Promise<BufferedSegment>((resolve, reject) => {
      // Encoded output trails the camera a little; give it up to 1.5 s to catch up
      const deadline = stopAt + 1500
      const check = (): void => {
        const last = this.chunks[this.chunks.length - 1]
        const ready = (last && last.at >= stopAt) || performance.now() >= deadline || !this.running
        if (!ready) { setTimeout(check, 30); return }
        try {
          resolve(this.buildSegment(wantStart, stopAt))
        } catch (err) {
          reject(err)
        } finally {
          const i = this.holds.indexOf(wantStart)
          if (i >= 0) this.holds.splice(i, 1)
          if (this.stopRequested && !this.holds.length) this.teardown()
        }
      }
      setTimeout(check, Math.max(0, stopAt - performance.now()))
    })
  }

  // ── Frame pump ──────────────────────────────────────────────────────────

  private async pump(): Promise<void> {
    const reader = this.reader
    if (!reader) return
    while (this.running) {
      let res: ReadableStreamReadResult<VideoFrame>
      try {
        res = await reader.read()
      } catch {
        break
      }
      if (res.done) break
      const frame = res.value
      try {
        this.handleFrame(frame)
      } catch (err) {
        console.error('[BufferedRecorder] frame error', err)
      } finally {
        // Hand the capture buffer straight back to the camera
        frame.close()
      }
    }
  }

  private handleFrame(frame: VideoFrame): void {
    const offset = performance.now() - frame.timestamp / 1000
    // Track the smallest delivery delay; jump if the camera clock resets
    if (offset < this.clockOffsetMs || offset - this.clockOffsetMs > 250) this.clockOffsetMs = offset

    if (this.failed || this.configuring) return
    const w = frame.displayWidth
    const h = frame.displayHeight
    if (!this.encoder || w !== this.encW || h !== this.encH) {
      void this.configure(w, h)
      return
    }
    if (this.encoder.state !== 'configured') return
    if (this.encoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
      this.droppedFrames++
      if (this.droppedFrames % 60 === 1) {
        console.warn(`[BufferedRecorder] encoder behind, skipped ${this.droppedFrames} frames so far`)
      }
      return
    }

    const keyFrame = this.needKey || this.framesSinceKey >= this.keyEvery
    this.encoder.encode(frame, { keyFrame })
    this.framesSinceKey = keyFrame ? 1 : this.framesSinceKey + 1
    this.needKey = false
  }

  // ── Encoder ─────────────────────────────────────────────────────────────

  private async configure(w: number, h: number): Promise<void> {
    this.configuring = true
    try {
      const found: VideoEncoderConfig[] = []
      for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
        for (const codec of CODECS) {
          const cfg: VideoEncoderConfig = {
            codec,
            width: w,
            height: h,
            bitrate: BITRATE,
            framerate: this.nominalFps,
            latencyMode: 'realtime',
            hardwareAcceleration,
            avc: { format: 'avc' }
          }
          try {
            const res = await VideoEncoder.isConfigSupported(cfg)
            if (res.supported) found.push(cfg)
          } catch { /* not supported */ }
        }
      }
      if (!this.running) return
      if (!found.length) {
        this.failed = `No H.264 encoder available for ${w}×${h}`
        console.error('[BufferedRecorder]', this.failed)
        return
      }
      this.candidates = found
      this.candidateIdx = 0
      this.encW = w
      this.encH = h
      this.openEncoder()
    } finally {
      this.configuring = false
    }
  }

  private openEncoder(): void {
    this.closeEncoder()
    this.chunks = []
    this.description = null
    this.needKey = true
    const cfg = this.candidates[this.candidateIdx]
    const enc: VideoEncoder = new VideoEncoder({
      output: (chunk, meta) => this.onChunk(enc, chunk, meta),
      error: (err) => this.onEncoderError(enc, err)
    })
    this.encoder = enc
    try {
      enc.configure(cfg)
      console.info(`[BufferedRecorder] encoding ${cfg.width}×${cfg.height} @ ${this.nominalFps} fps with ${cfg.codec} (${cfg.hardwareAcceleration})`)
    } catch (err) {
      this.onEncoderError(enc, err)
    }
  }

  private onEncoderError(enc: VideoEncoder, err: unknown): void {
    if (enc !== this.encoder) return
    const cfg = this.candidates[this.candidateIdx]
    console.warn(`[BufferedRecorder] encoder ${cfg?.codec} (${cfg?.hardwareAcceleration}) failed`, err)
    this.candidateIdx++
    if (this.running && this.candidateIdx < this.candidates.length) {
      this.openEncoder()
    } else {
      this.closeEncoder()
      this.failed = `Video encoder failed: ${String((err as Error)?.message ?? err)}`
    }
  }

  private onChunk(enc: VideoEncoder, chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void {
    if (enc !== this.encoder) return
    const desc = meta?.decoderConfig?.description
    if (desc) {
      const view = ArrayBuffer.isView(desc)
        ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength)
        : new Uint8Array(desc)
      this.description = view.slice()
    }
    const key = chunk.type === 'key'
    // The buffer must always start on a keyframe
    if (!this.chunks.length && !key) return
    const data = new Uint8Array(chunk.byteLength)
    chunk.copyTo(data)
    this.chunks.push({ key, ts: chunk.timestamp, at: chunk.timestamp / 1000 + this.clockOffsetMs, data })
    this.trim()
  }

  /** Drop whole GOPs that are older than the pre-roll (and no capture needs). */
  private trim(): void {
    const newest = this.chunks[this.chunks.length - 1]
    if (!newest) return
    const cutoff = Math.min(newest.at - this.keepMs, ...this.holds)
    let cut = 0
    for (let i = 1; i < this.chunks.length; i++) {
      const c = this.chunks[i]
      if (c.at > cutoff) break
      if (c.key) cut = i
    }
    if (cut > 0) this.chunks.splice(0, cut)
  }

  private closeEncoder(): void {
    const enc = this.encoder
    this.encoder = null
    if (enc && enc.state !== 'closed') {
      try { enc.close() } catch { /* ignore */ }
    }
  }

  private teardown(): void {
    this.running = false
    try { void this.reader?.cancel() } catch { /* ignore */ }
    this.reader = null
    this.closeEncoder()
    this.track?.stop()
    this.track = null
    this.chunks = []
  }

  // ── Save ────────────────────────────────────────────────────────────────

  private buildSegment(wantStart: number, stopAt: number): BufferedSegment {
    const all = this.chunks
    if (!all.length || !this.description) throw new Error('Camera recorded no data')

    // Last keyframe at or before the pre-roll point; otherwise the oldest one
    // we have (partial pre-roll right after arming)
    let s = -1
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].key && all[i].at <= wantStart) { s = i; break }
    }
    if (s < 0) s = all.findIndex((c) => c.key)
    if (s < 0) throw new Error('Camera recorded no keyframe')

    // Everything up to stopAt, plus one frame past it
    let e = s + 1
    while (e < all.length && all[e - 1].at < stopAt) e++
    const sel = all.slice(s, e)

    const first = sel[0]
    const last = sel[sel.length - 1]
    const spanSec = (last.ts - first.ts) / 1e6
    const fps = sel.length > 10 && spanSec > 0 ? (sel.length - 1) / spanSec : 0

    const startSec = Math.max(0, (wantStart - first.at) / 1000)
    const endSec = (stopAt - first.at) / 1000
    return {
      blob: muxMatroska(sel, this.description, this.encW, this.encH),
      ext: 'mkv',
      startSec,
      durationSec: Math.max(0.1, endSec - startSec),
      fps
    }
  }
}

// ── Minimal Matroska (MKV) writer for one H.264 track ─────────────────────

const textEncoder = new TextEncoder()

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0
  for (const p of parts) len += p.byteLength
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.byteLength }
  return out
}

function idBytes(id: number): Uint8Array {
  const bytes: number[] = []
  let v = id
  while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256) }
  return new Uint8Array(bytes)
}

/** Element size as an 8-byte EBML varint. */
function sizeBytes(size: number): Uint8Array {
  const out = new Uint8Array(8)
  out[0] = 0x01
  let v = size
  for (let i = 7; i >= 1; i--) { out[i] = v & 0xff; v = Math.floor(v / 256) }
  return out
}

function el(id: number, ...children: Uint8Array[]): Uint8Array {
  const body = concat(children)
  return concat([idBytes(id), sizeBytes(body.byteLength), body])
}

function uint(id: number, value: number): Uint8Array {
  const bytes: number[] = []
  let v = value
  do { bytes.unshift(v & 0xff); v = Math.floor(v / 256) } while (v > 0)
  return el(id, new Uint8Array(bytes))
}

function str(id: number, value: string): Uint8Array {
  return el(id, textEncoder.encode(value))
}

// Timestamps in the file are in 100 µs units
const TIMECODE_SCALE_NS = 100_000

function muxMatroska(chunks: StoredChunk[], avcC: Uint8Array, width: number, height: number): Blob {
  const header = el(0x1a45dfa3,
    uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8),
    str(0x4282, 'matroska'), uint(0x4287, 4), uint(0x4285, 2)
  )
  const info = el(0x1549a966,
    uint(0x2ad7b1, TIMECODE_SCALE_NS),
    str(0x4d80, 'Sendaswing'), str(0x5741, 'Sendaswing')
  )
  const tracks = el(0x1654ae6b,
    el(0xae,
      uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 1), uint(0x9c, 0),
      str(0x86, 'V_MPEG4/ISO/AVC'),
      el(0x63a2, avcC),
      el(0xe0, uint(0xb0, width), uint(0xba, height))
    )
  )

  // A new cluster at every keyframe (and before the int16 block offset overflows)
  const base = chunks[0].ts
  const clusters: Uint8Array[] = []
  let blocks: Uint8Array[] = []
  let clusterTc = 0
  const flush = (): void => {
    if (blocks.length) clusters.push(el(0x1f43b675, uint(0xe7, clusterTc), ...blocks))
    blocks = []
  }
  for (const c of chunks) {
    const tc = Math.max(0, Math.round((c.ts - base) * 1000 / TIMECODE_SCALE_NS))
    if (!blocks.length || c.key || tc - clusterTc > 30000) {
      flush()
      clusterTc = tc
    }
    const head = new Uint8Array(4)
    head[0] = 0x81 // track 1
    const rel = tc - clusterTc
    head[1] = (rel >> 8) & 0xff
    head[2] = rel & 0xff
    head[3] = c.key ? 0x80 : 0x00
    blocks.push(el(0xa3, head, c.data))
  }
  flush()

  const segment = el(0x18538067, info, tracks, ...clusters)
  return new Blob([header as BlobPart, segment as BlobPart], { type: 'video/x-matroska' })
}
