import type { DrawingToolType, Point, AnnotationStyle } from '../../types/drawing'

export interface ToolDefinition {
  type: DrawingToolType
  label: string
  icon: string
  minPoints: number
  maxPoints: number
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { type: 'select', label: 'Select', icon: 'MousePointer', minPoints: 0, maxPoints: 0 },
  { type: 'line', label: 'Line', icon: 'Minus', minPoints: 2, maxPoints: 2 },
  { type: 'arrow', label: 'Arrow', icon: 'ArrowRight', minPoints: 2, maxPoints: 2 },
  { type: 'circle', label: 'Circle', icon: 'Circle', minPoints: 2, maxPoints: 2 },
  { type: 'angle', label: 'Angle', icon: 'Triangle', minPoints: 3, maxPoints: 3 },
  { type: 'freehand', label: 'Freehand', icon: 'Pencil', minPoints: 2, maxPoints: Infinity }
]

export const DEFAULT_STYLE: AnnotationStyle = {
  color: '#22c55e',
  strokeWidth: 2,
  opacity: 1
}

export const TOOL_COLORS = [
  '#22c55e', // green
  '#ef4444', // red
  '#3b82f6', // blue
  '#f59e0b', // yellow
  '#a855f7', // purple
  '#ffffff'  // white
]

export function calcAngle(vertex: Point, p1: Point, p2: Point): number {
  const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x)
  const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x)
  let deg = Math.abs((a2 - a1) * 180) / Math.PI
  if (deg > 180) deg = 360 - deg
  return Math.round(deg)
}

export function calcDistance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
}
