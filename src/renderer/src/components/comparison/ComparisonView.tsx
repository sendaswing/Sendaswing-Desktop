import React from 'react'
import { ComparisonPanel } from './ComparisonPanel'
import { SyncControls } from './SyncControls'

export function ComparisonView() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-3 py-1.5 bg-surface-800 border-b border-white/5 shrink-0">
        <SyncControls />
      </div>
      <div className="flex flex-1 min-h-0 gap-0.5 bg-black">
        <div className="flex-1 min-w-0">
          <ComparisonPanel side="left" />
        </div>
        <div className="w-0.5 bg-white/5 shrink-0" />
        <div className="flex-1 min-w-0">
          <ComparisonPanel side="right" />
        </div>
      </div>
    </div>
  )
}
