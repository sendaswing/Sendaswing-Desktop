import React, { useMemo } from 'react'
import { useAnalysisStore } from '../../store/analysisStore'
import { useDrawing } from '../../hooks/useDrawing'
import type { Annotation, Point } from '../../types/drawing'
import { calcAngle } from '../../lib/drawing/tools'

function pct(n: number) {
  return `${n * 100}%`
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
    fill: 'none',
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
        <line
          x1={pct(a.x)} y1={pct(a.y)} x2={pct(b.x)} y2={pct(b.y)}
          {...strokeProps}
          markerEnd={`url(#${markerId})`}
        />
      </>
    )
  }

  if (ann.type === 'circle') {
    return (
      <ellipse
        cx={pct(ann.center.x)}
        cy={pct(ann.center.y)}
        rx={pct(ann.radius)}
        ry={pct(ann.radius)}
        {...strokeProps}
      />
    )
  }

  if (ann.type === 'angle') {
    const [vertex, p1, p2] = ann.points
    const deg = calcAngle(vertex, p1, p2)
    return (
      <>
        <line x1={pct(vertex.x)} y1={pct(vertex.y)} x2={pct(p1.x)} y2={pct(p1.y)} {...strokeProps} />
        <line x1={pct(vertex.x)} y1={pct(vertex.y)} x2={pct(p2.x)} y2={pct(p2.y)} {...strokeProps} />
        <text
          x={pct(vertex.x)}
          y={pct(vertex.y - 0.02)}
          fill={style.color}
          fontSize="12"
          fontFamily="monospace"
        >
          {deg}°
        </text>
      </>
    )
  }

  if (ann.type === 'freehand') {
    const d = ann.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${pct(p.x)},${pct(p.y)}`)
      .join(' ')
    return <path d={d} {...strokeProps} />
  }

  return null
}

export function DrawingCanvas() {
  const { annotations, currentFrame, activeTool } = useAnalysisStore()
  const { inProgressPoints, isDrawing, handlePointerDown, handlePointerMove, handlePointerUp } = useDrawing()

  const frameAnnotations = useMemo(
    () => annotations.flatMap((layer) => (layer.visible ? layer.annotations.filter((a) => a.frameIndex === currentFrame) : [])),
    [annotations, currentFrame]
  )

  const cursor = activeTool && activeTool !== 'select' ? 'crosshair' : 'default'

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {frameAnnotations.map((ann) => (
        <AnnotationShape key={ann.id} ann={ann} />
      ))}

      {isDrawing && inProgressPoints.length >= 1 && (
        <circle
          cx={pct(inProgressPoints[inProgressPoints.length - 1].x)}
          cy={pct(inProgressPoints[inProgressPoints.length - 1].y)}
          r="3"
          fill="#22c55e"
          opacity="0.8"
        />
      )}
    </svg>
  )
}
