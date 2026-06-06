import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface RangeCapability { min: number; max: number; step?: number }

interface ExtCapabilities {
  exposureMode?: string[]
  exposureTime?: RangeCapability
  exposureCompensation?: RangeCapability
  iso?: RangeCapability
  whiteBalanceMode?: string[]
  colorTemperature?: RangeCapability
  brightness?: RangeCapability
  contrast?: RangeCapability
  saturation?: RangeCapability
  sharpness?: RangeCapability
}

interface ExtSettings {
  exposureMode?: string
  exposureTime?: number
  exposureCompensation?: number
  iso?: number
  whiteBalanceMode?: string
  colorTemperature?: number
  brightness?: number
  contrast?: number
  saturation?: number
  sharpness?: number
}

interface Props {
  stream: MediaStream
  onClose: () => void
}

function hasRange(cap: RangeCapability | undefined): cap is RangeCapability {
  return !!cap && cap.max > cap.min
}

export function CameraSettingsPanel({ stream, onClose }: Props) {
  const track = stream.getVideoTracks()[0]
  const caps = (track?.getCapabilities?.() ?? {}) as ExtCapabilities
  const [settings, setSettings] = useState<ExtSettings>(() => (track?.getSettings?.() ?? {}) as ExtSettings)

  const applyRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apply = useCallback((key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    if (applyRef.current) clearTimeout(applyRef.current)
    applyRef.current = setTimeout(async () => {
      try {
        await track.applyConstraints({ advanced: [{ [key]: value } as any] })
      } catch { /* camera rejected constraint — ignore */ }
    }, 150)
  }, [track])

  useEffect(() => () => { if (applyRef.current) clearTimeout(applyRef.current) }, [])

  const hasExposureMode = (caps.exposureMode?.length ?? 0) > 1
  const hasWbMode = (caps.whiteBalanceMode?.length ?? 0) > 1
  const isManualExposure = settings.exposureMode === 'manual'
  const isManualWb = settings.whiteBalanceMode === 'manual'

  const sliders: Array<{ key: keyof ExtCapabilities & keyof ExtSettings; label: string; show: boolean; format?: (n: number) => string }> = [
    { key: 'exposureTime', label: 'Shutter', show: isManualExposure, format: (n) => `1/${Math.round(1e6 / n)}s` },
    { key: 'exposureCompensation', label: 'Exposure', show: true, format: (n) => (n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1)) + ' EV' },
    { key: 'iso', label: 'ISO', show: isManualExposure },
    { key: 'colorTemperature', label: 'White Balance', show: isManualWb, format: (n) => `${Math.round(n)}K` },
    { key: 'brightness', label: 'Brightness', show: true },
    { key: 'contrast', label: 'Contrast', show: true },
    { key: 'saturation', label: 'Saturation', show: true },
    { key: 'sharpness', label: 'Sharpness', show: true },
  ]

  const visibleSliders = sliders.filter(({ key, show }) => show && hasRange(caps[key] as RangeCapability | undefined))
  const hasAnyControl = hasExposureMode || hasWbMode || visibleSliders.length > 0

  return (
    <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col text-xs text-white/80 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <span className="font-semibold text-white/70 uppercase tracking-wider text-xs">Camera Settings</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 px-3 py-3 space-y-4">
        {!hasAnyControl ? (
          <p className="text-white/30 text-xs text-center pt-4">No adjustable settings for this camera.</p>
        ) : (
          <>
            {hasExposureMode && (
              <ToggleRow
                label="Exposure"
                options={caps.exposureMode!}
                value={settings.exposureMode ?? 'continuous'}
                onChange={(v) => apply('exposureMode', v)}
              />
            )}

            {hasWbMode && (
              <ToggleRow
                label="White Balance"
                options={caps.whiteBalanceMode!}
                value={settings.whiteBalanceMode ?? 'continuous'}
                onChange={(v) => apply('whiteBalanceMode', v)}
              />
            )}

            {visibleSliders.map(({ key, label, format }) => {
              const cap = caps[key] as RangeCapability
              const val = (settings[key] as number) ?? cap.min
              return (
                <SliderRow
                  key={key}
                  label={label}
                  min={cap.min}
                  max={cap.max}
                  step={cap.step ?? 1}
                  value={val}
                  display={format ? format(val) : String(Math.round(val))}
                  onChange={(n) => apply(key, n)}
                />
              )
            })}
          </>
        )}
      </div>

      <p className="px-3 pb-2 text-white/20 text-xs shrink-0">
        Available controls depend on camera and OS driver.
      </p>
    </div>
  )
}

function ToggleRow({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <span className="text-white/40 text-xs uppercase tracking-wider">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2 py-0.5 rounded text-xs capitalize transition-colors ${
              value === opt ? 'bg-accent-500 text-black font-semibold' : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function SliderRow({ label, min, max, step, value, display, onChange }: {
  label: string; min: number; max: number; step: number
  value: number; display: string; onChange: (n: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-white/40 text-xs uppercase tracking-wider">{label}</span>
        <span className="text-white/60 font-mono text-xs">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-accent-500 cursor-pointer"
      />
    </div>
  )
}
