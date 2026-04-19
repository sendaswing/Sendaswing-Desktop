import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CameraSlot, GridLayout } from '../types/camera'

interface CameraStore {
  availableDevices: MediaDeviceInfo[]
  slots: CameraSlot[]
  gridLayout: GridLayout
  refreshDevices: () => Promise<void>
  assignDevice: (slotIndex: number, deviceId: string, label: string) => void
  setStream: (slotIndex: number, stream: MediaStream | null) => void
  setSlotStatus: (slotIndex: number, status: CameraSlot['status'], error?: string) => void
  setGridLayout: (layout: GridLayout) => void
}

const defaultSlot = (index: number): CameraSlot => ({
  index,
  deviceId: null,
  label: `Camera ${index + 1}`,
  stream: null,
  status: 'idle',
  error: null
})

export const useCameraStore = create<CameraStore>()(
  immer((set) => ({
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
      set((state) => {
        state.slots[slotIndex].deviceId = deviceId
        state.slots[slotIndex].label = label
        state.slots[slotIndex].status = 'idle'
        state.slots[slotIndex].error = null
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
    }
  }))
)
