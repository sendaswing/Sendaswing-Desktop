import React, { useMemo } from 'react'
import { useAnalysisStore } from '../../store/analysisStore'
import { useDrawing } from '../../hooks/useDrawing'
import type { Annotation, AnnotationLayer, Point } from '../../types/drawing'
import { calcAngle } from '../../lib/drawing/tools'

function pct(n: number) {
  return `${(n * 100).toFixed(4)}%`
}

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill={color} />
      </marker>
    </defs>
  )
}

function AnnotationShape({ ann }: { ann: Annotation }) {
  const { style } = ann
  const strokeProps = {
    stroke: style.color,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }

  if (ann.type === 'line') {
    const [a, b] = ann.points
    return <line x1={pct(a.x)} y1={pct(a.y)} x2={pct(b.x)} y2={pct(b.y)} {...strokeProps} />
  }

  if (ann.type === 'arrow') {
    const [a, b] = ann.points
    const markerId = `arrow-${ann.id}`
    return (
      <>
        <ArrowMarker id={markerId} color={style.color} />
        <line x1={pct(a.x)} y1={pct(a.y)} x2={pct(b.x)} y2={pct(b.y)}
          {...strokeProps} markerEnd={`url(#${markerId})`} />
      </>
    )
  }

  if (ann.type === 'circle') {
    return (
      <ellipse cx={pct(ann.center.x)} cy={pct(ann.center.y)}
        rx={pct(ann.radius)} ry={pct(ann.radius)} {...strokeProps} />
    )
  }

  if (ann.type === 'angle') {
    const [vertex, p1, p2] = ann.points
    const deg = calcAngle(vertex, p1, p2)
    return (
      <>
        <line x1={pct(vertex.x)} y1={pct(vertex.y)} x2={pct(p1.x)} y2={pct(p1.y)} {...strokeProps} />
        <line x1={pct(vertex.x)} y1={pct(vertex.y)} x2={pct(p2.x)} y2={pct(p2.y)} {...strokeProps} />
        <text x={pct(vertex.x)} y={pct(Math.max(0, vertex.y - 0.02))}
          fill={style.color} fontSize="13" fontFamily="monospace" fontWeight="bold">
          {deg}°
        </text>
      </>
    )
  }

  if (ann.type === 'freehand') {
    const d = ann.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${pct(p.x)},${pct(p.y)}`).join(' ')
    return <path d={d} {...strokeProps} />
  }

  return null
}

interface DrawingCanvasProps {
  annotations?: AnnotationLayer[]
  onAddAnnotation?: (ann: Annotation) => void
  frameIndex?: number
}

export function DrawingCanvas({ annotations: annotationsProp, onAddAnnotation, frameIndex }: DrawingCanvasProps = {}) {
  const store = useAnalysisStore()
  const annotations = annotationsProp ?? store.annotations
  const currentFrame = frameIndex ?? store.currentFrame
  const { activeTool, activeStyle } = store

  const { isDrawing, previewStart, previewEnd, anglePoints, handlePointerDown, handlePointerMove, handlePointerUp } = useDrawing({
    frameIndex: currentFrame,
    onAddAnnotation
  })

  const frameAnnotations = useMemo(
    () => annotations.flatMap((layer) =>
      layer.visible ? layer.annotations : []
    ),
    [annotations]
  )

  const cursor = activeTool && activeTool !== 'select' ? 'crosshair' : 'default'

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {frameAnnotations.map((ann) => (
        <AnnotationShape key={ann.id} ann={ann} />
      ))}

      {isDrawing && previewStart && previewEnd && (
        <>
          {(activeTool === 'line' || activeTool === 'arrow') && (
            <line
              x1={pct(previewStart.x)} y1={pct(previewStart.y)}
              x2={pct(previewEnd.x)} y2={pct(previewEnd.y)}
              stroke={activeStyle.color} strokeWidth={activeStyle.strokeWidth}
              opacity={0.7} strokeDasharray="6 3"
            />
          )}
          {activeTool === 'circle' && (() => {
            const dx = previewEnd.x - previewStart.x
            const dy = previewEnd.y - previewStart.y
            const r = Math.sqrt(dx * dx + dy * dy)
            return (
              <ellipse cx={pct(previewStart.x)} cy={pct(previewStart.y)}
                rx={pct(r)} ry={pct(r)}
                stroke={activeStyle.color} strokeWidth={activeStyle.strokeWidth}
                fill="none" opacity={0.7} strokeDasharray="6 3" />
            )
          })()}
        </>
      )}

      {activeTool === 'angle' && anglePoints.map((pt, i) => (
        <circle key={i} cx={pct(pt.x)} cy={pct(pt.y)} r="4"
          fill={activeStyle.color} opacity={0.9} />
      ))}
    </svg>
  )
}
