import React from 'react'
import { CameraGrid } from './CameraGrid'
import { RecordingControls } from './RecordingControls'

export function CaptureView() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <CameraGrid />
      </div>
      <RecordingControls />
    </div>
  )
}
