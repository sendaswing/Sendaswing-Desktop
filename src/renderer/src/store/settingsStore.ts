import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface SettingsStore {
  recordingsDir: string
  setRecordingsDir: (dir: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
  immer((set) => ({
    recordingsDir: '',

    setRecordingsDir: (dir) => {
      set((state) => {
        state.recordingsDir = dir
      })
    }
  }))
)
