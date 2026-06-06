import { useCallback, useRef } from 'react'
import { useRecordingStore } from '../store/recordingStore'
import { useClipStore } from '../store/clipStore'
import { useSettingsStore } from '../store/settingsStore'
import { RecordingSession } from '../lib/recording/RecordingSession'

const sessions = new Map<number, RecordingSession>()

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

export function useRecorder() {
  const { setSlotRecording, setIsRecordingAll, setCountdown } = useRecordingStore()
  const { addClip } = useClipStore()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  const startRecording = useCallback(async (slotIndex: number, stream: MediaStream, label: string, cameraAngle: string, club: string, swingNumber: number) => {
    const session = new RecordingSession(slotIndex, label, cameraAngle, club, swingNumber)
    sessions.set(slotIndex, session)
    const sessionId = await session.start(stream)
    setSlotRecording(slotIndex, { status: 'recording', sessionId, startTime: Date.now(), elapsed: 0 })
  }, [])

  const stopRecording = useCallback(async (slotIndex: number) => {
    const session = sessions.get(slotIndex)
    if (!session) return
    setSlotRecording(slotIndex, { status: 'stopping' })
    const clip = await session.stop()
    sessions.delete(slotIndex)
    if (clip) addClip(clip)
    setSlotRecording(slotIndex, { status: 'saved', sessionId: null })
    setTimeout(() => setSlotRecording(slotIndex, { status: 'idle' }), 2000)
  }, [])

  const stopAll = useCallback(async () => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setIsRecordingAll(false)
    const indices = Array.from(sessions.keys())
    await Promise.all(indices.map(stopRecording))
  }, [])

  const startAll = useCallback(async (activeSlots: Array<{ index: number; stream: MediaStream; label: string; cameraAngle: string; club: string }>) => {
    const { recordingDelay, recordingDuration } = useSettingsStore.getState()

    // Countdown phase
    for (let i = recordingDelay; i > 0; i--) {
      if (cancelledRef.current) {
        cancelledRef.current = false
        setCountdown(null)
        return
      }
      setCountdown(i)
      await sleep(1000)
    }
    setCountdown(null)

    // Check again after final sleep
    if (cancelledRef.current) {
      cancelledRef.current = false
      return
    }

    setIsRecordingAll(true)
    const swingNumber: number = await (window as any).electronAPI.recording.nextSwingNumber()
    await Promise.all(activeSlots.map((s) => startRecording(s.index, s.stream, s.label, s.cameraAngle, s.club, swingNumber)))

    timerRef.current = setInterval(() => {
      for (const [idx] of sessions) {
        const rec = useRecordingStore.getState().slotRecordings[idx]
        if (rec.startTime) {
          setSlotRecording(idx, { elapsed: Math.floor((Date.now() - rec.startTime) / 1000) })
        }
      }
    }, 1000)

    if (recordingDuration > 0) {
      autoStopRef.current = setTimeout(() => stopAll(), recordingDuration * 1000)
    }
  }, [stopAll])

  const cancelCountdown = useCallback(() => {
    cancelledRef.current = true
    setCountdown(null)
  }, [])

  return { startRecording, stopRecording, startAll, stopAll, cancelCountdown }
}
