import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface SettingsStore {
  recordingsDir: string
  libraryDir: string
  setRecordingsDir: (dir: string) => void
  setLibraryDir: (dir: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
  immer((set) => ({
    recordingsDir: '',
    libraryDir: '',

    setRecordingsDir: (dir) => {
      set((state) => { state.recordingsDir = dir })
    },

    setLibraryDir: (dir) => {
      set((state) => { state.libraryDir = dir })
    }
  }))
)
