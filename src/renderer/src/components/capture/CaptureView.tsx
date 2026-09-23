import React from 'react'
import { CameraGrid } from './CameraGrid'
import { RecordingControls } from './RecordingControls'
import { useBufferedCapture } from '../../hooks/useBufferedCapture'

export function CaptureView() {
  // Buffered mode: keep a rolling pre-roll while this screen is showing
  useBufferedCapture()

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <CameraGrid />
      </div>
      <RecordingControls />
    </div>
  )
}
