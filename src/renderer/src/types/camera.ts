export type GridLayout = '1x1' | '2x1' | '2x2'

export interface CameraSlot {
  index: number
  deviceId: string | null
  label: string
  stream: MediaStream | null
  status: 'idle' | 'streaming' | 'error'
  error: string | null
}
