import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Clip } from '../types/clip'

interface ComparisonStore {
  leftClip: Clip | null
  rightClip: Clip | null
  leftFrame: number
  rightFrame: number
  isSynced: boolean
  setLeftClip: (clip: Clip | null) => void
  setRightClip: (clip: Clip | null) => void
  setLeftFrame: (frame: number) => void
  setRightFrame: (frame: number) => void
  setIsSynced: (val: boolean) => void
}

export const useComparisonStore = create<ComparisonStore>()(
  immer((set) => ({
    leftClip: null,
    rightClip: null,
    leftFrame: 0,
    rightFrame: 0,
    isSynced: false,

    setLeftClip: (clip) => {
      set((state) => {
        state.leftClip = clip
        state.leftFrame = 0
      })
    },

    setRightClip: (clip) => {
      set((state) => {
        state.rightClip = clip
        state.rightFrame = 0
      })
    },

    setLeftFrame: (frame) => {
      set((state) => {
        state.leftFrame = frame
      })
    },

    setRightFrame: (frame) => {
      set((state) => {
        state.rightFrame = frame
      })
    },

    setIsSynced: (val) => {
      set((state) => {
        state.isSynced = val
      })
    }
  }))
)
