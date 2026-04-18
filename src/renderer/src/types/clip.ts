import type { AnnotationLayer } from './drawing'

export interface Clip {
  id: string
  name: string
  filePath: string
  duration: number
  fps: number
  frameCount: number
  thumbnailPath: string | null
  recordedAt: string
  cameraLabel: string
  tags: string[]
  annotations: AnnotationLayer[]
}

export interface ClipMeta {
  name: string
  tags: string[]
  cameraLabel: string
}
