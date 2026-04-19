export function formatTimecode(frameIndex: number, fps: number): string {
  const totalSecs = frameIndex / fps
  const mins = Math.floor(totalSecs / 60)
  const secs = Math.floor(totalSecs % 60)
  const frames = frameIndex % Math.round(fps)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(frames).padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
