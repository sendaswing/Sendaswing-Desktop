import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Clip, ClipMeta } from '../types/clip'

interface ClipStore {
  clips: Clip[]
  addClip: (clip: Clip) => void
  removeClip: (id: string) => void
  updateClipMeta: (id: string, meta: Partial<ClipMeta>) => void
  setClips: (clips: Clip[]) => void
}

export const useClipStore = create<ClipStore>()(
  immer((set) => ({
    clips: [],

    addClip: (clip) => {
      set((state) => {
        state.clips.unshift(clip)
      })
    },

    removeClip: (id) => {
      set((state) => {
        state.clips = state.clips.filter((c) => c.id !== id)
      })
    },

    updateClipMeta: (id, meta) => {
      set((state) => {
        const clip = state.clips.find((c) => c.id === id)
        if (clip) Object.assign(clip, meta)
      })
    },

    setClips: (clips) => {
      set((state) => {
        state.clips = clips
      })
    }
  }))
)
