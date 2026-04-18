import type { Clip } from '../../types/clip'

export class RecordingSession {
  private recorder: MediaRecorder | null = null
  private sessionId: string | null = null
  private slotIndex: number
  private cameraLabel: string

  constructor(slotIndex: number, cameraLabel: string) {
    this.slotIndex = slotIndex
    this.cameraLabel = cameraLabel
  }

  async start(stream: MediaStream): Promise<string> {
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=h264')
      ? 'video/mp4;codecs=h264'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'

    const filename = `swing_${Date.now()}_cam${this.slotIndex}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`

    this.sessionId = await (window as any).electronAPI.recording.init({
      filename,
      cameraLabel: this.cameraLabel
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
