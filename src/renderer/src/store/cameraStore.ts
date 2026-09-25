import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CameraSlot, CameraAngle, GridLayout } from '../types/camera'
import { useCameraProfileStore } from './cameraProfileStore'

interface CameraStore {
  availableDevices: MediaDeviceInfo[]
  slots: CameraSlot[]
  gridLayout: GridLayout
  refreshDevices: () => Promise<void>
  assignDevice: (slotIndex: number, deviceId: string, label: string) => void
  setStream: (slotIndex: number, stream: MediaStream | null) => void
  setSlotStatus: (slotIndex: number, status: CameraSlot['status'], error?: string) => void
  setGridLayout: (layout: GridLayout) => void
  setCameraAngle: (slotIndex: number, angle: CameraAngle) => void
  setFlip: (slotIndex: number, axis: 'H' | 'V', value: boolean) => void
}

const defaultSlot = (index: number): CameraSlot => ({
  index,
  deviceId: null,
  label: `Camera ${index + 1}`,
  stream: null,
  status: 'idle',
  error: null,
  cameraAngle: '',
  flipH: false,
  flipV: false
})

export const useCameraStore = create<CameraStore>()(
  immer((set, get) => ({
    availableDevices: [],
    slots: [defaultSlot(0), defaultSlot(1), defaultSlot(2), defaultSlot(3)],
    gridLayout: '2x1',

    refreshDevices: async () => {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch(() => {})
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((d) => d.kind === 'videoinput')
      set((state) => {
        state.availableDevices = videoDevices
      })
    },

    assignDevice: (slotIndex, deviceId, label) => {
      // A camera we've seen before brings back its own angle and flips
      const profile = useCameraProfileStore.getState().profiles[deviceId]
      set((state) => {
        const slot = state.slots[slotIndex]
        slot.deviceId = deviceId
        slot.label = label
        slot.status = 'idle'
        slot.error = null
        if (profile) {
          slot.cameraAngle = profile.angle
          slot.flipH = profile.flipH
          slot.flipV = profile.flipV
        }
      })
      const slot = get().slots[slotIndex]
      useCameraProfileStore.getState().rememberSlot(slotIndex, deviceId, {
        label, angle: slot.cameraAngle, flipH: slot.flipH, flipV: slot.flipV
      })
    },

    setStream: (slotIndex, stream) => {
      set((state) => {
        state.slots[slotIndex].stream = stream
        state.slots[slotIndex].status = stream ? 'streaming' : 'idle'
      })
    },

    setSlotStatus: (slotIndex, status, error) => {
      set((state) => {
        state.slots[slotIndex].status = status
        state.slots[slotIndex].error = error ?? null
      })
    },

    setGridLayout: (layout) => {
      set((state) => {
        state.gridLayout = layout
      })
    },

    setCameraAngle: (slotIndex, angle) => {
      set((state) => {
        state.slots[slotIndex].cameraAngle = angle
      })
      const id = get().slots[slotIndex].deviceId
      if (id) useCameraProfileStore.getState().updateProfile(id, { angle })
    },

    setFlip: (slotIndex, axis, value) => {
      set((state) => {
        if (axis === 'H') state.slots[slotIndex].flipH = value
        else state.slots[slotIndex].flipV = value
      })
      const id = get().slots[slotIndex].deviceId
      if (id) useCameraProfileStore.getState().updateProfile(id, axis === 'H' ? { flipH: value } : { flipV: value })
    }
  }))
)
