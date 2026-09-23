import { useEffect, useMemo } from 'react'
import { useCameraStore } from '../store/cameraStore'
import { useSettingsStore } from '../store/settingsStore'
import { bufferedCapture, type ArmSlot } from '../lib/recording/BufferedCaptureController'

/**
 * Mount this on the Capture screen. While the screen is showing and the
 * capture mode is Buffered, every live camera (with an angle set) keeps a
 * rolling pre-roll buffer and the trigger mic listens for the strike.
 * Leaving the screen stops it all so Analyze gets the CPU for scrubbing.
 */
export function useBufferedCapture(): void {
  const captureMode = useSettingsStore((s) => s.captureMode)
  const preRollSec = useSettingsStore((s) => s.preRollSec)
  const triggerMicId = useSettingsStore((s) => s.triggerMicId)
  const thresholdDb = useSettingsStore((s) => s.triggerThresholdDb)
  const slots = useCameraStore((s) => s.slots)
  const gridLayout = useCameraStore((s) => s.gridLayout)

  const visibleCount = gridLayout === '1x1' ? 1 : gridLayout === '2x1' ? 2 : 4

  // Only re-arm when something that changes the recording actually changes
  const armSlots: ArmSlot[] = useMemo(() => slots
    .slice(0, visibleCount)
    .filter((s) => s.stream && s.status === 'streaming' && s.cameraAngle)
    .map((s) => ({
      index: s.index,
      stream: s.stream!,
      label: s.label,
      cameraAngle: s.cameraAngle,
      flipH: s.flipH,
      flipV: s.flipV
    })), [slots, visibleCount])

  const armKey = armSlots
    .map((s) => `${s.index}:${s.stream.id}:${s.cameraAngle}:${s.flipH ? 1 : 0}${s.flipV ? 1 : 0}`)
    .join('|')

  const buffered = captureMode === 'buffered'

  useEffect(() => {
    if (!buffered || !armSlots.length) {
      bufferedCapture.disarm()
      return
    }
    bufferedCapture.arm(armSlots)
    return () => bufferedCapture.disarm()
    // armKey captures everything relevant in armSlots
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffered, armKey, preRollSec])

  // Mic follows the camera arming (disarm() also stops it)
  useEffect(() => {
    if (!buffered || !armSlots.length) return
    void bufferedCapture.setMic(triggerMicId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffered, armKey, preRollSec, triggerMicId])

  useEffect(() => {
    bufferedCapture.setThresholdDb(thresholdDb)
  }, [thresholdDb])
}
