import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type RecordingStatus = 'idle' | 'recording' | 'stopping' | 'saved'

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
  setSlotRecording: (slotIndex: number, update: Partial<SlotRecording>) => void
  setIsRecordingAll: (val: boolean) => void
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

    setSlotRecording: (slotIndex, update) => {
      set((state) => {
        Object.assign(state.slotRecordings[slotIndex], update)
      })
    },

    setIsRecordingAll: (val) => {
      set((state) => {
        state.isRecordingAll = val
      })
    }
  }))
)
