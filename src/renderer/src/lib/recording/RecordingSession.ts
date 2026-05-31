import type { Clip } from '../../types/clip'

export class RecordingSession {
  private recorder: MediaRecorder | null = null
  private sessionId: string | null = null
  private slotIndex: number
  private cameraLabel: string
  private cameraAngle: string
  private club: string

  private swingNumber: number

  constructor(slotIndex: number, cameraLabel: string, cameraAngle: string, club: string, swingNumber: number) {
    this.slotIndex = slotIndex
    this.cameraLabel = cameraLabel
    this.cameraAngle = cameraAngle
    this.club = club
    this.swingNumber = swingNumber
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

    this.sessionId = await (window as any).electronAPI.recording.init({
      filename,
      cameraLabel: this.cameraLabel,
      cameraAngle: this.cameraAngle,
      club: this.club
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
