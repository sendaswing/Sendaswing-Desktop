import { useEffect } from 'react'
import { useCameraStore } from '../store/cameraStore'
import { useCameraProfileStore } from '../store/cameraProfileStore'
import { useCameras } from './useCameras'

let restored = false

/**
 * Crash-loop guard. Set while the remembered cameras are being started and
 * cleared once they're all up. If it's still set at the next launch, the app
 * died while opening a camera last time — so skip the auto-restore and let the
 * cameras be picked by hand instead of crashing again on every launch.
 */
const RESTORE_GUARD_KEY = 'snds-camera-restore-in-progress'

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
    let crashedLastTime = false
    try {
      crashedLastTime = localStorage.getItem(RESTORE_GUARD_KEY) === '1'
    } catch {
      /* storage unavailable — just restore */
    }
    if (crashedLastTime) {
      console.warn('[cameras] app closed while opening cameras last launch — skipping auto-restore')
      try {
        localStorage.removeItem(RESTORE_GUARD_KEY)
      } catch {
        /* ignore */
      }
      useCameraProfileStore.getState().clearSlots()
      return
    }
    void (async () => {
      try {
        localStorage.setItem(RESTORE_GUARD_KEY, '1')
      } catch {
        /* ignore */
      }
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
      try {
        localStorage.removeItem(RESTORE_GUARD_KEY)
      } catch {
        /* ignore */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
