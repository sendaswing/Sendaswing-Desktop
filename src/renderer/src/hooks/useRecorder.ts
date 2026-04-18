import { useCallback, useRef } from 'react'
import { useRecordingStore } from '../store/recordingStore'
import { useClipStore } from '../store/clipStore'
import { RecordingSession } from '../lib/recording/RecordingSession'

const sessions = new Map<number, RecordingSession>()

export function useRecorder() {
  const { setSlotRecording, setIsRecordingAll } = useRecordingStore()
  const { addClip } = useClipStore()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startRecording = useCallback(async (slotIndex: number, stream: MediaStream, label: string) => {
    const session = new RecordingSession(slotIndex, label)
    sessions.set(slotIndex, session)

    const sessionId = await session.start(stream)
    setSlotRecording(slotIndex, {
      status: 'recording',
      sessionId,
      startTime: Date.now(),
      elapsed: 0
    })
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

  const startAll = useCallback(async (activeSlots: Array<{ index: number; stream: MediaStream; label: string }>) => {
    setIsRecordingAll(true)
    await Promise.all(activeSlots.map((s) => startRecording(s.index, s.stream, s.label)))

    timerRef.current = setInterval(() => {
      for (const [idx] of sessions) {
        const rec = useRecordingStore.getState().slotRecordings[idx]
        if (rec.startTime) {
          setSlotRecording(idx, { elapsed: Math.floor((Date.now() - rec.startTime) / 1000) })
        }
      }
    }, 1000)
  }, [])

  const stopAll = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setIsRecordingAll(false)
    const indices = Array.from(sessions.keys())
    await Promise.all(indices.map(stopRecording))
  }, [])

  return { startRecording, stopRecording, startAll, stopAll }
}
