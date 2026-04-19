import type { AnnotationLayer } from '../../types/drawing'

export function serializeAnnotations(layers: AnnotationLayer[]): string {
  return JSON.stringify(layers)
}

export function deserializeAnnotations(data: string): AnnotationLayer[] {
  try {
    return JSON.parse(data) as AnnotationLayer[]
  } catch {
    return []
  }
}
