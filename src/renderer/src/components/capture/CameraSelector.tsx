import React from 'react'
import { useCameraStore } from '../../store/cameraStore'
import { useCameras } from '../../hooks/useCameras'
import { cn } from '../../lib/utils/cn'
import type { CameraAngle } from '../../types/camera'

interface CameraSelectorProps {
  slotIndex: number
}

const ANGLES: CameraAngle[] = ['FO', 'DL', 'Other']

export function CameraSelector({ slotIndex }: CameraSelectorProps) {
  const { availableDevices, slots, assignDevice, setCameraAngle } = useCameraStore()
  const { startStream } = useCameras()
  const slot = slots[slotIndex]

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value
    if (!deviceId) return
    const device = availableDevices.find((d) => d.deviceId === deviceId)
    assignDevice(slotIndex, deviceId, device?.label ?? `Camera ${slotIndex + 1}`)
    await startStream(slotIndex)
  }

  const handleAngle = (angle: CameraAngle) => {
    setCameraAngle(slotIndex, slot.cameraAngle === angle ? '' : angle)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={slot.deviceId ?? ''}
        onChange={handleChange}
        className="text-xs bg-black/40 border border-white/10 rounded px-2 py-1 text-white/80 max-w-full truncate"
      >
        <option value="">— Select camera —</option>
        {availableDevices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>

      <div className="flex gap-1 items-center">
        <span className="text-xs text-white/25 shrink-0">Angle:</span>
        {ANGLES.map((angle) => (
          <button
            key={angle}
            onClick={() => handleAngle(angle)}
            className={cn(
              'px-2 py-0.5 rounded text-xs font-mono transition-colors',
              slot.cameraAngle === angle
                ? 'bg-accent-500 text-black font-bold'
                : 'bg-white/5 text-white/35 hover:text-white/70 hover:bg-white/10'
            )}
          >
            {angle}
          </button>
        ))}
      </div>
    </div>
  )
}
