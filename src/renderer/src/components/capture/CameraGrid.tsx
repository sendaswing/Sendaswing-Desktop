import React from 'react'
import { useCameraStore } from '../../store/cameraStore'
import { CameraCell } from './CameraCell'
import { cn } from '../../lib/utils/cn'
import type { GridLayout } from '../../types/camera'

const LAYOUT_SLOTS: Record<GridLayout, number[]> = {
  '1x1': [0],
  '2x1': [0, 1],
  '2x2': [0, 1, 2, 3]
}

const GRID_CLASS: Record<GridLayout, string> = {
  '1x1': 'grid-cols-1 grid-rows-1',
  '2x1': 'grid-cols-2 grid-rows-1',
  '2x2': 'grid-cols-2 grid-rows-2'
}

export function CameraGrid() {
  const gridLayout = useCameraStore((s) => s.gridLayout)
  const slots = LAYOUT_SLOTS[gridLayout]

  return (
    <div className={cn('grid gap-0.5 w-full h-full bg-black', GRID_CLASS[gridLayout])}>
      {slots.map((i) => (
        <CameraCell key={i} slotIndex={i} />
      ))}
    </div>
  )
}
