/**
 * FlipProxy — wraps a camera MediaStream and produces a flipped proxy stream
 * suitable for recording. The original stream is left untouched (the live
 * preview keeps working). Only instantiated when flipH or flipV is active.
 */
export class FlipProxy {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private video: HTMLVideoElement
  private rafId: number | null = null

  readonly proxyStream: MediaStream

  constructor(source: MediaStream, flipH: boolean, flipV: boolean) {
    // Detect frame rate from the source track; fall back to 60
    const track = source.getVideoTracks()[0]
    const frameRate = track?.getSettings?.().frameRate ?? 60

    // Hidden canvas — size updated once video metadata loads
    this.canvas = document.createElement('canvas')
    this.canvas.width = 1920
    this.canvas.height = 1080
    this.ctx = this.canvas.getContext('2d')!

    // Hidden video element to receive the raw source stream
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'
    document.body.appendChild(this.video)
    this.video.srcObject = source

    this.video.addEventListener('loadedmetadata', () => {
      const w = this.video.videoWidth
      const h = this.video.videoHeight
      if (w && h) {
        this.canvas.width = w
        this.canvas.height = h
      }
    })

    this.video.play().catch(() => { /* camera may refuse autoplay in some edge cases */ })

    // Start draw loop
    this.rafId = requestAnimationFrame(this.draw.bind(this, flipH, flipV))

    // Capture the flipped frames as a MediaStream
    this.proxyStream = this.canvas.captureStream(frameRate)
  }

  private draw(flipH: boolean, flipV: boolean): void {
    const { videoWidth: w, videoHeight: h } = this.video

    if (w && h) {
      const ctx = this.ctx
      ctx.save()
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

      // Apply flip transform: translate origin to the flipped edge, then scale
      if (flipH && flipV) {
        ctx.translate(w, h)
        ctx.scale(-1, -1)
      } else if (flipH) {
        ctx.translate(w, 0)
        ctx.scale(-1, 1)
      } else {
        ctx.translate(0, h)
        ctx.scale(1, -1)
      }

      ctx.drawImage(this.video, 0, 0, w, h)
      ctx.restore()
    }

    this.rafId = requestAnimationFrame(this.draw.bind(this, flipH, flipV))
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.video.pause()
    this.video.srcObject = null
    if (this.video.parentNode) this.video.parentNode.removeChild(this.video)
    // Stop the proxy tracks so MediaRecorder knows the stream ended
    for (const track of this.proxyStream.getTracks()) track.stop()
  }
}
