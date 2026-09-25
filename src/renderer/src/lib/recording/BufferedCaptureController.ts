/**
 * BufferedCaptureController — app-wide singleton that owns the rolling camera
 * buffers and the trigger mic, and turns a trigger into saved clips.
 *
 * Lifecycle (driven by useBufferedCapture on the Capture screen):
 *   arm()      – Capture screen is showing in Buffered mode → start rolling
 *   trigger()  – strike heard / Save Swing key → keep post-roll, save, replay
 *   disarm()   – left the Capture screen or switched mode → stop everything
 *
 * A capture that is already in flight finishes even if we disarm mid-way
 * (that is exactly what happens when auto-replay jumps to Analyze).
 */
import { BufferedRecorder } from './BufferedRecorder'
import { SoundTrigger } from './SoundTrigger'
import { useRecordingStore } from '../../store/recordingStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useClipStore } from '../../store/clipStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { useUiStore } from '../../store/uiStore'
import type { Clip } from '../../types/clip'

export interface ArmSlot {
  index: number
  stream: MediaStream
  label: string
  cameraAngle: string
  flipH: boolean
  flipV: boolean
}

interface ArmedCamera {
  slot: ArmSlot
  recorder: BufferedRecorder
  fps: number
}

const api = () => (window as any).electronAPI

class Controller {
  private cameras: ArmedCamera[] = []
  private mic: SoundTrigger | null = null
  private micDeviceId = ''
  private statusTimer: ReturnType<typeof setInterval> | null = null
  private armed = false
  private capturing = false
  private processingCount = 0

  get isArmed(): boolean {
    return this.armed
  }

  arm(slots: ArmSlot[]): void {
    this.disarmCameras()
    const { preRollSec } = useSettingsStore.getState()
    for (const slot of slots) {
      // Record the raw camera; flips are applied by ffmpeg when the swing is saved
      const fps = slot.stream.getVideoTracks()[0]?.getSettings?.().frameRate ?? 60
      const recorder = new BufferedRecorder(slot.stream, preRollSec, fps)
      recorder.start()
      this.cameras.push({ slot, recorder, fps })
    }
    this.armed = this.cameras.length > 0
    this.updateStatus()
    if (!this.statusTimer) {
      this.statusTimer = setInterval(() => this.reportBuffered(), 250)
    }
  }

  disarm(): void {
    this.disarmCameras()
    this.stopMic()
    this.armed = false
    if (this.statusTimer) { clearInterval(this.statusTimer); this.statusTimer = null }
    useRecordingStore.getState().setBufferedSec(0)
    this.updateStatus()
  }

  /** Start (or switch) the trigger mic. '' turns the sound trigger off. */
  async setMic(deviceId: string): Promise<void> {
    if (deviceId === this.micDeviceId && this.mic) return
    this.stopMic()
    this.micDeviceId = deviceId
    const store = useRecordingStore.getState()
    store.setMicError(null)
    if (!deviceId) return

    const { triggerThresholdDb, postRollSec } = useSettingsStore.getState()
    const mic = new SoundTrigger(deviceId, {
      thresholdDb: triggerThresholdDb,
      // One strike = one swing; ignore echoes/follow-up noise until the save is underway
      cooldownMs: (postRollSec + 1.5) * 1000,
      onTrigger: (at) => { void this.trigger(at) },
      onLevel: (db) => useRecordingStore.getState().setMicLevelDb(db)
    })
    this.mic = mic
    try {
      await mic.start()
    } catch (err) {
      if (this.mic === mic) {
        this.mic = null
        this.micDeviceId = ''
      }
      mic.stop()
      store.setMicError(`Couldn't open the trigger mic: ${String((err as Error)?.message ?? err)}`)
    }
  }

  setThresholdDb(db: number): void {
    this.mic?.setThresholdDb(db)
  }

  /** Save the swing that happened at `at` (performance.now()); defaults to right now. */
  async trigger(at: number = performance.now()): Promise<void> {
    if (!this.armed || this.capturing || !this.cameras.length) return
    this.capturing = true
    this.mic?.suppress()
    this.updateStatus()

    const { preRollSec, postRollSec, autoReplay } = useSettingsStore.getState()
    const club = useRecordingStore.getState().pendingClub
    const cams = [...this.cameras]
    const ui = useUiStore.getState()

    // Claim each camera's buffer immediately, then wait out the post-roll
    const pending = Promise.allSettled(cams.map((c) => c.recorder.capture(at, preRollSec, postRollSec)))

    let swingNumber = 1
    try {
      swingNumber = await api().recording.nextSwingNumber()
    } catch { /* fall back to 1; main bumps it past existing files */ }

    const segments = await pending
    this.capturing = false
    this.processingCount++
    this.updateStatus()

    if (autoReplay) {
      // Jump to Analyze now; it shows "Saving swing…" until the clip is ready
      useAnalysisStore.getState().setPendingImportPath(null)
      ui.setRoute('analyze')
    }

    const saved: Clip[] = []
    const errors: string[] = []
    await Promise.all(segments.map(async (res, i) => {
      const cam = cams[i]
      if (res.status !== 'fulfilled') {
        errors.push(`${cam.slot.cameraAngle || cam.slot.label}: ${String(res.reason?.message ?? res.reason)}`)
        return
      }
      try {
        const data = new Uint8Array(await res.value.blob.arrayBuffer())
        // Trust the camera's nominal rate unless the frames say otherwise (e.g. a
        // camera that drops to 50 fps in low light) so replay has no duplicate frames
        const measured = res.value.fps
        const fps = measured > 0 && Math.abs(measured - cam.fps) / cam.fps > 0.05 ? Math.round(measured) : cam.fps
        const out = await api().capture.saveBuffered({
          data,
          ext: res.value.ext,
          startSec: res.value.startSec,
          durationSec: res.value.durationSec,
          fps,
          flipH: cam.slot.flipH,
          flipV: cam.slot.flipV,
          swingNumber,
          cameraAngle: cam.slot.cameraAngle,
          cameraLabel: cam.slot.label,
          club
        })
        if (out.ok) saved[i] = out.clip as Clip
        else errors.push(`${cam.slot.cameraAngle}: ${out.error}`)
      } catch (err) {
        errors.push(`${cam.slot.cameraAngle}: ${String(err)}`)
      }
    }))

    // addClip puts new clips at the top; add in reverse so camera 1 ends up first
    const clips = saved.filter(Boolean)
    const addClip = useClipStore.getState().addClip
    for (let i = clips.length - 1; i >= 0; i--) addClip(clips[i])

    if (autoReplay && clips[0]) useAnalysisStore.getState().setActiveClip(clips[0])

    this.processingCount--
    this.updateStatus()

    if (errors.length) {
      console.error('[BufferedCapture] save failed', errors)
      ui.showToast(`Swing ${swingNumber} not fully saved — ${errors[0]}`, 'error')
    } else if (clips.length) {
      ui.showToast(`Swing ${swingNumber} saved`)
    }
  }

  private stopMic(): void {
    this.mic?.stop()
    this.mic = null
    this.micDeviceId = ''
    useRecordingStore.getState().setMicLevelDb(null)
  }

  private disarmCameras(): void {
    for (const cam of this.cameras) cam.recorder.stop()
    this.cameras = []
  }

  private reportBuffered(): void {
    if (!this.cameras.length) return
    const { preRollSec } = useSettingsStore.getState()
    const sec = Math.min(preRollSec, ...this.cameras.map((c) => c.recorder.bufferedSec()))
    const rounded = Math.floor(sec * 4) / 4
    if (useRecordingStore.getState().bufferedSec !== rounded) {
      useRecordingStore.getState().setBufferedSec(rounded)
    }
  }

  private updateStatus(): void {
    const store = useRecordingStore.getState()
    const status =
      this.capturing ? 'capturing' :
      this.processingCount > 0 ? 'processing' :
      this.armed ? 'buffering' : 'off'
    if (store.bufferStatus !== status) store.setBufferStatus(status)
  }
}

export const bufferedCapture = new Controller()
