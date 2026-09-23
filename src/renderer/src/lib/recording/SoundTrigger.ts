/**
 * SoundTrigger — listens to a microphone and fires when the level spikes past
 * a threshold (the club striking the ball). Used to save a buffered swing
 * hands-free.
 *
 * Echo cancellation / noise suppression / auto-gain are turned OFF: they are
 * built for voice calls and would squash exactly the sharp transient we want.
 */

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

export function linearToDb(v: number): number {
  return v <= 0.00001 ? -100 : 20 * Math.log10(v)
}

interface SoundTriggerOptions {
  thresholdDb: number
  /** Ignore further spikes for this long after a trigger (ms). */
  cooldownMs: number
  onTrigger: (at: number) => void
  /** Peak level in dBFS, reported ~20x per second for the meter. */
  onLevel?: (db: number) => void
}

export class SoundTrigger {
  private deviceId: string
  private opts: SoundTriggerOptions
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private buf: Float32Array<ArrayBuffer> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastTrigger = 0
  private lastLevelReport = 0
  private levelPeak = 0
  private armed = true

  constructor(deviceId: string, opts: SoundTriggerOptions) {
    this.deviceId = deviceId
    this.opts = opts
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    })
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    // A context created without a click can start suspended; the analyser reads silence until resumed
    await this.ctx.resume().catch(() => {})
    const source = this.ctx.createMediaStreamSource(this.stream)
    this.analyser = this.ctx.createAnalyser()
    // ~21 ms of audio at 48 kHz; polling every 10 ms means no spike slips between reads
    this.analyser.fftSize = 1024
    this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4))
    source.connect(this.analyser)
    // setInterval keeps running when the window isn't focused (rAF would throttle)
    this.pollTimer = setInterval(() => this.poll(), 10)
  }

  setThresholdDb(db: number): void {
    this.opts.thresholdDb = db
  }

  /** While disarmed the meter still works but nothing fires. */
  setArmed(v: boolean): void {
    this.armed = v
  }

  /** Start a cooldown now (e.g. after a manual hotkey capture). */
  suppress(): void {
    this.lastTrigger = performance.now()
  }

  stop(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.ctx?.close().catch(() => {})
    this.ctx = null
    this.analyser = null
  }

  private poll(): void {
    if (!this.analyser || !this.buf) return
    this.analyser.getFloatTimeDomainData(this.buf)
    let peak = 0
    for (let i = 0; i < this.buf.length; i++) {
      const v = Math.abs(this.buf[i])
      if (v > peak) peak = v
    }
    const now = performance.now()

    if (peak > this.levelPeak) this.levelPeak = peak
    if (now - this.lastLevelReport >= 50) {
      this.opts.onLevel?.(linearToDb(this.levelPeak))
      this.levelPeak = 0
      this.lastLevelReport = now
    }

    if (
      this.armed &&
      peak >= dbToLinear(this.opts.thresholdDb) &&
      now - this.lastTrigger >= this.opts.cooldownMs
    ) {
      this.lastTrigger = now
      this.opts.onTrigger(now)
    }
  }
}
