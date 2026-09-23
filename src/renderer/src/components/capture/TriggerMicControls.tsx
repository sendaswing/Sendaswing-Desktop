import React, { useCallback, useEffect, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useRecordingStore } from '../../store/recordingStore'
import { cn } from '../../lib/utils/cn'

const MIN_DB = -60

/** Map dBFS (-60..0) to 0..100% for the meter. */
function pct(db: number): number {
  return Math.max(0, Math.min(100, ((db - MIN_DB) / -MIN_DB) * 100))
}

async function listMics(): Promise<MediaDeviceInfo[]> {
  let devices = await navigator.mediaDevices.enumerateDevices()
  let mics = devices.filter((d) => d.kind === 'audioinput')
  // Labels stay blank until mic permission has been granted once
  if (mics.length && mics.every((m) => !m.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      s.getTracks().forEach((t) => t.stop())
      devices = await navigator.mediaDevices.enumerateDevices()
      mics = devices.filter((d) => d.kind === 'audioinput')
    } catch { /* keep unlabeled list */ }
  }
  // Drop Windows' "default"/"communications" aliases — they duplicate real devices
  return mics.filter((m) => m.deviceId !== 'default' && m.deviceId !== 'communications')
}

/**
 * Trigger mic picker + live level meter with a draggable threshold.
 * A strike louder than the threshold saves the swing.
 */
export function TriggerMicControls({ disabled }: { disabled?: boolean }) {
  const triggerMicId = useSettingsStore((s) => s.triggerMicId)
  const setTriggerMicId = useSettingsStore((s) => s.setTriggerMicId)
  const thresholdDb = useSettingsStore((s) => s.triggerThresholdDb)
  const setThresholdDb = useSettingsStore((s) => s.setTriggerThresholdDb)
  const levelDb = useRecordingStore((s) => s.micLevelDb)
  const micError = useRecordingStore((s) => s.micError)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])

  const refresh = useCallback(() => { listMics().then(setMics).catch(() => setMics([])) }, [])

  useEffect(() => {
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [refresh])

  const selectedMissing = triggerMicId && mics.length > 0 && !mics.some((m) => m.deviceId === triggerMicId)
  const hot = levelDb !== null && levelDb >= thresholdDb

  return (
    <div className="flex items-center gap-2 min-w-0">
      {triggerMicId ? <Mic size={13} className="text-white/40 shrink-0" /> : <MicOff size={13} className="text-white/25 shrink-0" />}
      <select
        value={triggerMicId}
        onChange={(e) => setTriggerMicId(e.target.value)}
        disabled={disabled}
        title="Microphone that listens for the strike"
        className="text-xs bg-black/40 border border-white/10 rounded px-2 py-1 text-white/80 max-w-[190px] truncate disabled:opacity-40"
      >
        <option value="">Sound trigger off (hotkey only)</option>
        {mics.map((m) => (
          <option key={m.deviceId} value={m.deviceId}>
            {m.label || `Microphone ${m.deviceId.slice(0, 6)}`}
          </option>
        ))}
        {selectedMissing && <option value={triggerMicId}>(disconnected mic)</option>}
      </select>

      {triggerMicId && (
        <div className="flex items-center gap-2" title="Drag to set how loud the strike must be">
          {/* Meter with threshold marker; the range input sits on top to drag the threshold */}
          <div className="relative w-36 h-4">
            <div className="absolute inset-y-1 inset-x-0 rounded bg-white/10 overflow-hidden">
              <div
                className={cn('h-full transition-[width] duration-75', hot ? 'bg-red-500' : 'bg-accent-500/80')}
                style={{ width: `${levelDb === null ? 0 : pct(levelDb)}%` }}
              />
            </div>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-300 pointer-events-none"
              style={{ left: `calc(${pct(thresholdDb)}% - 1px)` }}
            />
            <input
              type="range"
              min={MIN_DB}
              max={0}
              step={1}
              value={thresholdDb}
              disabled={disabled}
              onChange={(e) => setThresholdDb(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
              aria-label="Trigger threshold"
            />
          </div>
          <span className="text-[10px] font-mono text-white/40 w-11 tabular-nums">{thresholdDb} dB</span>
        </div>
      )}

      {micError && <span className="text-xs text-red-400/80 truncate" title={micError}>Mic error</span>}
    </div>
  )
}
