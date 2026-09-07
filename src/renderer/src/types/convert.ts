// Mirrors the types in src/main/ipc/convert.ts

export interface ProbeResult {
  width: number
  height: number
  fps: number
  duration: number
  codec: string
  sizeBytes: number
  rotation: number
}

export type ResolutionOption = '720' | '1080' | 'original'
export type QualityOption = 'fast' | 'balanced' | 'best'

export interface ConvertRequest {
  srcPath: string
  startSec: number
  endSec: number
  resolution: ResolutionOption
  quality: QualityOption
  cameraAngle: string
  club: string
}
