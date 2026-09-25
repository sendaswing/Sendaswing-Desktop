import { useEffect, useCallback } from 'react'
import { useCameraStore } from '../store/cameraStore'
import { useCameraProfileStore } from '../store/cameraProfileStore'
import { applyControls, readControls } from '../lib/camera/cameraControls'

const streams = new Map<number, MediaStream>()

export function useCameras() {
  const { refreshDevices, setStream, setSlotStatus } = useCameraStore()

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

      // Put back this camera's saved shutter / gain / white balance etc. The
      // first time we see a camera, save what it's set to now instead.
      const track = stream.getVideoTracks()[0]
      const deviceId = slot.deviceId
      if (track) {
        const saved = useCameraProfileStore.getState().profiles[deviceId]?.controls
        if (saved && Object.keys(saved).length) await applyControls(track, saved)
        else useCameraProfileStore.getState().setControls(deviceId, readControls(track))
      }

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
