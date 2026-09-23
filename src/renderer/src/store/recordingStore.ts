import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type RecordingStatus = 'idle' | 'recording' | 'stopping' | 'saved'

/**
 * Buffered capture state:
 *  off        – not in buffered mode / not on the Capture screen
 *  buffering  – cameras rolling, waiting for a strike or the Save Swing key
 *  capturing  – trigger fired, recording the follow-through (post-roll)
 *  processing – trimming + converting the swing to the studio format
 */
export type BufferStatus = 'off' | 'buffering' | 'capturing' | 'processing'

export interface SlotRecording {
  slotIndex: number
  status: RecordingStatus
  sessionId: string | null
  startTime: number | null
  elapsed: number
}

interface RecordingStore {
  slotRecordings: SlotRecording[]
  isRecordingAll: boolean
  pendingClub: string
  countdown: number | null

  bufferStatus: BufferStatus
  /** Seconds of pre-roll currently in memory (caps at the pre-roll setting). */
  bufferedSec: number
  /** Latest trigger-mic peak in dBFS, or null when no mic is listening. */
  micLevelDb: number | null
  micError: string | null
  setBufferStatus: (s: BufferStatus) => void
  setBufferedSec: (n: number) => void
  setMicLevelDb: (db: number | null) => void
  setMicError: (e: string | null) => void

  setSlotRecording: (slotIndex: number, update: Partial<SlotRecording>) => void
  setIsRecordingAll: (val: boolean) => void
  setPendingClub: (club: string) => void
  setCountdown: (n: number | null) => void
}

const defaultSlotRecording = (index: number): SlotRecording => ({
  slotIndex: index,
  status: 'idle',
  sessionId: null,
  startTime: null,
  elapsed: 0
})

export const useRecordingStore = create<RecordingStore>()(
  immer((set) => ({
    slotRecordings: [0, 1, 2, 3].map(defaultSlotRecording),
    isRecordingAll: false,
    pendingClub: '',
    countdown: null,
    bufferStatus: 'off',
    bufferedSec: 0,
    micLevelDb: null,
    micError: null,

    setBufferStatus: (v) => { set((state) => { state.bufferStatus = v }) },
    setBufferedSec: (n) => { set((state) => { state.bufferedSec = n }) },
    setMicLevelDb: (db) => { set((state) => { state.micLevelDb = db }) },
    setMicError: (e) => { set((state) => { state.micError = e }) },

    setSlotRecording: (slotIndex, update) => {
      set((state) => { Object.assign(state.slotRecordings[slotIndex], update) })
    },
    setIsRecordingAll: (val) => {
      set((state) => { state.isRecordingAll = val })
    },
    setPendingClub: (club) => {
      set((state) => { state.pendingClub = club })
    },
    setCountdown: (n) => {
      set((state) => { state.countdown = n })
    }
  }))
)
