import React from 'react'
import { useCameraStore } from '../../store/cameraStore'
import { useCameras } from '../../hooks/useCameras'

interface CameraSelectorProps {
  slotIndex: number
}

export function CameraSelector({ slotIndex }: CameraSelectorProps) {
  const { availableDevices, slots, assignDevice } = useCameraStore()
  const { startStream } = useCameras()
  const slot = slots[slotIndex]

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value
    if (!deviceId) return
    const device = availableDevices.find((d) => d.deviceId === deviceId)
    assignDevice(slotIndex, deviceId, device?.label ?? `Camera ${slotIndex + 1}`)
    await startStream(slotIndex)
  }

  return (
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
  )
}
