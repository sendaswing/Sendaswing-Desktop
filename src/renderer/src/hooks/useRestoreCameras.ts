import { useEffect } from 'react'
import { useCameraStore } from '../store/cameraStore'
import { useCameraProfileStore } from '../store/cameraProfileStore'
import { useCameras } from './useCameras'

let restored = false

/**
 * Once per launch: put each remembered camera back in its grid slot and start
 * it. Its angle, flips and image controls come back with it (see
 * assignDevice in cameraStore and startStream in useCameras).
 */
export function useRestoreCameras(): void {
  const { startStream } = useCameras()

  useEffect(() => {
    if (restored) return
    restored = true
    void (async () => {
      await useCameraStore.getState().refreshDevices()
      const { availableDevices } = useCameraStore.getState()
      const remembered = useCameraProfileStore.getState().slotDevices
      const used = new Set<string>()
      for (let i = 0; i < remembered.length; i++) {
        const id = remembered[i]
        if (!id || used.has(id)) continue
        const slot = useCameraStore.getState().slots[i]
        if (!slot || slot.deviceId) continue
        const device = availableDevices.find((d) => d.deviceId === id)
        if (!device) continue
        used.add(id)
        useCameraStore.getState().assignDevice(i, id, device.label || `Camera ${i + 1}`)
        await startStream(i)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
