export type DrawingToolType = 'line' | 'circle' | 'angle' | 'arrow' | 'freehand' | 'select'

export interface Point {
  x: number
  y: number
}

export interface AnnotationStyle {
  color: string
  strokeWidth: number
  opacity: number
}

export type Annotation =
  | { type: 'line'; id: string; frameIndex: number; points: [Point, Point]; style: AnnotationStyle }
  | { type: 'circle'; id: string; frameIndex: number; center: Point; radius: number; style: AnnotationStyle }
  | { type: 'angle'; id: string; frameIndex: number; points: [Point, Point, Point]; style: AnnotationStyle }
  | { type: 'arrow'; id: string; frameIndex: number; points: [Point, Point]; style: AnnotationStyle }
  | { type: 'freehand'; id: string; frameIndex: number; points: Point[]; style: AnnotationStyle }

export interface AnnotationLayer {
  id: string
  name: string
  annotations: Annotation[]
  visible: boolean
}
