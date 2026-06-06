import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface SettingsStore {
  recordingsDir: string
  libraryDir: string
  recordingDelay: number
  recordingDuration: number
  setRecordingsDir: (dir: string) => void
  setLibraryDir: (dir: string) => void
  setRecordingDelay: (n: number) => void
  setRecordingDuration: (n: number) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      recordingsDir: '',
      libraryDir: '',
      recordingDelay: 3,
      recordingDuration: 6,

      setRecordingsDir: (dir) => { set((s) => { s.recordingsDir = dir }) },
      setLibraryDir: (dir) => { set((s) => { s.libraryDir = dir }) },
      setRecordingDelay: (n) => { set((s) => { s.recordingDelay = n }) },
      setRecordingDuration: (n) => { set((s) => { s.recordingDuration = n }) }
    })),
    {
      name: 'snds-settings',
      partialize: (s) => ({ recordingDelay: s.recordingDelay, recordingDuration: s.recordingDuration })
    }
  )
)
