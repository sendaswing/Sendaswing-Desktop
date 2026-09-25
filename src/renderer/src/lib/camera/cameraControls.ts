/**
 * Camera image controls (shutter, gain, white balance, brightness…) read from
 * and written to a live camera track through MediaStreamTrack constraints.
 *
 * Windows note: Chromium reports exposureTime in 100 µs units, and on Windows
 * the camera only accepts power-of-two steps (10000 = 1 s, 156.25 = 1/64 s,
 * 78.125 = 1/128 s, …). "exposureCompensation" is the camera's gain.
 */

// Modes first: a manual shutter / colour temperature only sticks once the
// camera is in manual mode.
export const CONTROL_KEYS = [
  'exposureMode',
  'whiteBalanceMode',
  'exposureTime',
  'exposureCompensation',
  'colorTemperature',
  'brightness',
  'contrast',
  'saturation',
  'sharpness'
] as const

export type ControlKey = (typeof CONTROL_KEYS)[number]
export type CameraControls = Partial<Record<ControlKey, number | string>>

function capabilities(track: MediaStreamTrack): Record<string, unknown> {
  return (track.getCapabilities?.() ?? {}) as Record<string, unknown>
}

/** Current values of every control this camera supports. */
export function readControls(track: MediaStreamTrack): CameraControls {
  const caps = capabilities(track)
  const settings = (track.getSettings?.() ?? {}) as Record<string, unknown>
  const out: CameraControls = {}
  for (const key of CONTROL_KEYS) {
    const v = settings[key]
    if (key in caps && (typeof v === 'number' || typeof v === 'string')) out[key] = v
  }
  return out
}

/** Push saved values back onto the camera. Unsupported or rejected values are skipped. */
export async function applyControls(track: MediaStreamTrack, controls: CameraControls): Promise<void> {
  const caps = capabilities(track)
  const current = (track.getSettings?.() ?? {}) as Record<string, unknown>
  const exposureMode = controls.exposureMode ?? current.exposureMode
  const wbMode = controls.whiteBalanceMode ?? current.whiteBalanceMode
  for (const key of CONTROL_KEYS) {
    const value = controls[key]
    if (value === undefined || !(key in caps)) continue
    if (key === 'exposureTime' && exposureMode !== 'manual') continue
    if (key === 'colorTemperature' && wbMode !== 'manual') continue
    try {
      await track.applyConstraints({ advanced: [{ [key]: value } as MediaTrackConstraintSet] })
    } catch (err) {
      console.warn(`[camera] could not set ${key}=${value}`, err)
    }
  }
}

export interface ShutterOption {
  value: number
  label: string
}

/**
 * Standard shutter speeds (1/60 … 1/8000) this camera can do, as exposureTime
 * values. On Windows the values snap to the power-of-two steps the driver
 * accepts (1/60 → 1/64 s, 1/125 → 1/128 s, …).
 */
export function shutterOptions(cap: { min: number; max: number; step?: number }): ShutterOption[] {
  const powerOfTwo = !!cap.step && Math.abs(cap.step - cap.min) < 1e-6
  const denominators = [60, 125, 250, 500, 1000, 2000, 4000, 8000]
  return denominators
    .map((d) => ({
      value: powerOfTwo ? 10000 / 2 ** Math.round(Math.log2(d)) : 10000 / d,
      label: `1/${d}`
    }))
    .filter((o) => o.value >= cap.min - 1e-6 && o.value <= cap.max + 1e-6)
}

/** The option closest to the camera's current exposureTime. */
export function nearestShutter(options: ShutterOption[], value: number | undefined): ShutterOption | null {
  if (!options.length || !value || value <= 0) return null
  let best = options[0]
  for (const o of options) {
    if (Math.abs(Math.log(o.value / value)) < Math.abs(Math.log(best.value / value))) best = o
  }
  // Longer than 1/60 isn't one of the choices — show nothing selected
  return Math.abs(Math.log(best.value / value)) < 0.4 ? best : null
}
