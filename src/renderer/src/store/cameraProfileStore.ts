import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { CameraAngle } from '../types/camera'
import type { CameraControls, ControlKey } from '../lib/camera/cameraControls'

/**
 * Remembered per physical camera (keyed by deviceId, which stays the same
 * across restarts): its angle, flips and image controls. Also remembers which
 * camera was in which grid slot so the Capture screen comes back as it was.
 * Saved in localStorage.
 */
export interface CameraProfile {
  label: string
  angle: CameraAngle
  flipH: boolean
  flipV: boolean
  controls: CameraControls
}

interface CameraProfileStore {
  profiles: Record<string, CameraProfile>
  /** deviceId per grid slot (index 0–3), or null. */
  slotDevices: (string | null)[]
  rememberSlot: (slotIndex: number, deviceId: string, defaults: Omit<CameraProfile, 'controls'>) => void
  updateProfile: (deviceId: string, patch: Partial<Omit<CameraProfile, 'controls'>>) => void
  setControls: (deviceId: string, controls: CameraControls) => void
  setControl: (deviceId: string, key: ControlKey, value: number | string) => void
}

const emptyProfile = (label: string): CameraProfile => ({
  label, angle: '', flipH: false, flipV: false, controls: {}
})

export const useCameraProfileStore = create<CameraProfileStore>()(
  persist(
    immer((set) => ({
      profiles: {},
      slotDevices: [null, null, null, null],

      rememberSlot: (slotIndex, deviceId, defaults) => {
        set((s) => {
          // A camera lives in one slot at a time
          s.slotDevices = s.slotDevices.map((id, i) => (i === slotIndex ? deviceId : id === deviceId ? null : id))
          if (!s.profiles[deviceId]) s.profiles[deviceId] = { ...defaults, controls: {} }
          else s.profiles[deviceId].label = defaults.label
        })
      },

      updateProfile: (deviceId, patch) => {
        set((s) => {
          s.profiles[deviceId] = { ...(s.profiles[deviceId] ?? emptyProfile('')), ...patch }
        })
      },

      setControls: (deviceId, controls) => {
        set((s) => {
          const p = s.profiles[deviceId] ?? (s.profiles[deviceId] = emptyProfile(''))
          p.controls = { ...controls }
        })
      },

      setControl: (deviceId, key, value) => {
        set((s) => {
          const p = s.profiles[deviceId] ?? (s.profiles[deviceId] = emptyProfile(''))
          p.controls[key] = value
        })
      }
    })),
    {
      name: 'snds-cameras',
      partialize: (s) => ({ profiles: s.profiles, slotDevices: s.slotDevices })
    }
  )
)
