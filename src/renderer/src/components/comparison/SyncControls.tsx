import React from 'react'
import { Link, Unlink } from 'lucide-react'
import { useComparisonStore } from '../../store/comparisonStore'
import { cn } from '../../lib/utils/cn'

export function SyncControls() {
  const { isSynced, setIsSynced } = useComparisonStore()

  return (
    <button
      onClick={() => setIsSynced(!isSynced)}
      title={isSynced ? 'Unsync scrubbers' : 'Sync scrubbers'}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
        isSynced
          ? 'bg-accent-500/20 text-accent-400 ring-1 ring-accent-500/40'
          : 'bg-white/5 text-white/40 hover:text-white/70'
      )}
    >
      {isSynced ? <Link size={12} /> : <Unlink size={12} />}
      {isSynced ? 'Synced' : 'Sync'}
    </button>
  )
}
