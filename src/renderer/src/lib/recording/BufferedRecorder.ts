/**
 * BufferedRecorder — keeps the last few seconds of one camera in memory so a
 * swing can be saved AFTER it happens (pre-roll), V1/GolfTec style.
 *
 * MediaRecorder can't drop old data from the front of a file, so instead we
 * run overlapping recorders ("segments"), a new one every `windowMs`, and
 * throw away any segment older than two windows. At any moment the oldest
 * live segment has been running for at least `windowMs`, so with
 * windowMs >= pre-roll there is always enough history for the backswing.
 *
 * On a trigger we "claim" the best segment, let it keep recording through the
 * post-roll, then stop it and hand back the whole blob plus where the trigger
 * falls inside it. The main process trims and converts it with ffmpeg.
 * Other segments keep rotating, so the next swing is already being buffered.
 */

interface Segment {
  recorder: MediaRecorder
  chunks: Blob[]
  /** performance.now() when the recorder actually started (onstart). */
  startedAt: number
  claimed: boolean
  discarded: boolean
}

export interface BufferedSegment {
  blob: Blob
  ext: 'mp4' | 'webm'
  /** Seconds into the blob where the saved clip should start. */
  startSec: number
  /** Seconds to keep from startSec. */
  durationSec: number
}

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

export class BufferedRecorder {
  private stream: MediaStream
  private windowMs: number
  private mimeType: string
  private segments: Segment[] = []
  private rotateTimer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(stream: MediaStream, preRollSec: number) {
    this.stream = stream
    // Half a second of slack so timer jitter never leaves us short of pre-roll
    this.windowMs = Math.max(1000, preRollSec * 1000 + 500)
    this.mimeType = pickMimeType()
  }

  get ext(): 'mp4' | 'webm' {
    return this.mimeType.includes('mp4') ? 'mp4' : 'webm'
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.startSegment()
    this.rotateTimer = setInterval(() => this.rotate(), this.windowMs)
  }

  stop(): void {
    this.running = false
    if (this.rotateTimer) { clearInterval(this.rotateTimer); this.rotateTimer = null }
    for (const seg of this.segments) {
      if (!seg.claimed) this.discard(seg)
    }
    this.segments = this.segments.filter((s) => s.claimed)
  }

  /** Seconds of history currently available (for the "buffer ready" indicator). */
  bufferedSec(now = performance.now()): number {
    const live = this.segments.filter((s) => !s.claimed && !s.discarded && s.startedAt > 0)
    if (!live.length) return 0
    return (now - Math.min(...live.map((s) => s.startedAt))) / 1000
  }

  /**
   * Save the swing whose impact happened at `triggerAt` (performance.now()).
   * Resolves after the post-roll has been recorded.
   */
  capture(triggerAt: number, preRollSec: number, postRollSec: number): Promise<BufferedSegment> {
    const wantStart = triggerAt - preRollSec * 1000
    const live = this.segments.filter((s) => !s.claimed && !s.discarded && s.startedAt > 0)
    if (!live.length) return Promise.reject(new Error('Camera buffer is not running yet'))

    // Newest segment that still covers the full pre-roll (smallest file for ffmpeg);
    // otherwise the oldest one we have (partial pre-roll right after arming).
    const covering = live.filter((s) => s.startedAt <= wantStart).sort((a, b) => b.startedAt - a.startedAt)
    const seg = covering[0] ?? live.sort((a, b) => a.startedAt - b.startedAt)[0]
    seg.claimed = true

    // Start the replacement right away so buffering never has a gap
    if (this.running) this.startSegment()

    const stopAt = triggerAt + postRollSec * 1000
    const waitMs = Math.max(0, stopAt - performance.now())

    return new Promise<BufferedSegment>((resolve, reject) => {
      setTimeout(() => {
        const rec = seg.recorder
        rec.onstop = () => {
          this.segments = this.segments.filter((s) => s !== seg)
          const blob = new Blob(seg.chunks, { type: this.mimeType })
          seg.chunks = []
          if (!blob.size) { reject(new Error('Camera recorded no data')); return }
          const startSec = Math.max(0, (wantStart - seg.startedAt) / 1000)
          const endSec = (stopAt - seg.startedAt) / 1000
          resolve({ blob, ext: this.ext, startSec, durationSec: Math.max(0.1, endSec - startSec) })
        }
        try {
          if (rec.state !== 'inactive') rec.stop()
          else rec.onstop?.(new Event('stop'))
        } catch (err) {
          reject(err)
        }
      }, waitMs)
    })
  }

  private startSegment(): void {
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType,
        // Source quality for the ffmpeg re-encode; high-fps cameras need the headroom
        videoBitsPerSecond: 16_000_000
      })
    } catch (err) {
      console.error('[BufferedRecorder] could not create MediaRecorder', err)
      return
    }
    const seg: Segment = { recorder, chunks: [], startedAt: 0, claimed: false, discarded: false }
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && !seg.discarded) seg.chunks.push(e.data)
    }
    recorder.onstart = () => { seg.startedAt = performance.now() }
    // Flush every second so a claimed segment's data is mostly in hand already
    recorder.start(1000)
    this.segments.push(seg)
  }

  private rotate(): void {
    if (!this.running) return
    const now = performance.now()
    // Anything unclaimed older than ~1.5 windows is covered by a younger segment
    for (const seg of this.segments) {
      if (!seg.claimed && seg.startedAt > 0 && now - seg.startedAt > this.windowMs * 1.5) this.discard(seg)
    }
    this.segments = this.segments.filter((s) => !s.discarded)
    this.startSegment()
  }

  private discard(seg: Segment): void {
    seg.discarded = true
    seg.chunks = []
    try { if (seg.recorder.state !== 'inactive') seg.recorder.stop() } catch { /* ignore */ }
  }
}
