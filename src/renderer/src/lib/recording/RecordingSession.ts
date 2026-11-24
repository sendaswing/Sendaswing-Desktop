import type { Clip } from '../../types/clip'

export class RecordingSession {
  private recorder: MediaRecorder | null = null
  private sessionId: string | null = null
  private cameraLabel: string
  private cameraAngle: string
  private club: string

  private swingNumber: number
  private flipH: boolean
  private flipV: boolean

  constructor(_slotIndex: number, cameraLabel: string, cameraAngle: string, club: string, swingNumber: number, flipH = false, flipV = false) {
    this.cameraLabel = cameraLabel
    this.cameraAngle = cameraAngle
    this.club = club
    this.swingNumber = swingNumber
    this.flipH = flipH
    this.flipV = flipV
  }

  async start(stream: MediaStream): Promise<string> {
    const mimeType =
      MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E') ? 'video/mp4;codecs=avc1.42E01E' :
      MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')        ? 'video/mp4;codecs=avc1' :
      MediaRecorder.isTypeSupported('video/mp4;codecs=h264')        ? 'video/mp4;codecs=h264' :
      MediaRecorder.isTypeSupported('video/mp4')                    ? 'video/mp4' :
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9')        ? 'video/webm;codecs=vp9' :
      'video/webm'

    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const filename = `${mm}.${dd}.${now.getFullYear()}.${this.cameraAngle}.${this.swingNumber}.${ext}`

    // Flips are applied by ffmpeg in the main process when the recording is
    // finalized (same as Buffered mode), so the raw camera stream is recorded
    // at its full frame rate. The camera's fps is passed along because
    // MediaRecorder files often don't carry a usable one.
    const fps = stream.getVideoTracks()[0]?.getSettings?.().frameRate
    this.sessionId = await (window as any).electronAPI.recording.init({
      filename,
      cameraLabel: this.cameraLabel,
      cameraAngle: this.cameraAngle,
      club: this.club,
      flipH: this.flipH,
      flipV: this.flipV,
      fps
    })

    this.recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000
    })

    this.recorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && this.sessionId) {
        const buffer = await e.data.arrayBuffer()
        await (window as any).electronAPI.recording.chunk(this.sessionId, new Uint8Array(buffer))
      }
    }

    this.recorder.start(500)
    return this.sessionId!
  }

  async stop(): Promise<Clip | null> {
    if (!this.recorder || !this.sessionId) return null

    return new Promise((resolve) => {
      this.recorder!.onstop = async () => {
        const result = await (window as any).electronAPI.recording.finalize(this.sessionId!)
        resolve(result)
      }
      this.recorder!.stop()
    })
  }

  get isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }
}
