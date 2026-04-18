import { useEffect, useRef, useCallback } from 'react'
import { useCameraStore } from '../store/cameraStore'

const streams = new Map<number, MediaStream>()

export function useCameras() {
  const { slots, refreshDevices, setStream, setSlotStatus } = useCameraStore()

  useEffect(() => {
    refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [])

  const startStream = useCallback(async (slotIndex: number) => {
    const slot = useCameraStore.getState().slots[slotIndex]
    if (!slot.deviceId) return

    const existing = streams.get(slotIndex)
    if (existing) {
      existing.getTracks().forEach((t) => t.stop())
    }

    setSlotStatus(slotIndex, 'streaming')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: slot.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 120, max: 240 }
        },
        audio: false
      })
      streams.set(slotIndex, stream)
      setStream(slotIndex, stream)
    } catch (err) {
      setSlotStatus(slotIndex, 'error', String(err))
    }
  }, [])

  const stopStream = useCallback((slotIndex: number) => {
    const stream = streams.get(slotIndex)
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      streams.delete(slotIndex)
    }
    setStream(slotIndex, null)
  }, [])

  const getStream = useCallback((slotIndex: number) => streams.get(slotIndex) ?? null, [])

  return { startStream, stopStream, getStream }
}
