import { useState, useCallback, useRef } from 'react'
import { useAnalysisStore } from '../store/analysisStore'
import type { Point, Annotation } from '../types/drawing'
import { calcAngle } from '../lib/drawing/tools'

let annotationIdCounter = 0
const nextId = () => `ann-${++annotationIdCounter}`

function getPoint(e: React.PointerEvent<SVGSVGElement>): Point {
  const rect = e.currentTarget.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height
  }
}

export function useDrawing() {
  const { activeTool, activeStyle, currentFrame, addAnnotation } = useAnalysisStore()

  // For drag-based tools: start point stored in ref to avoid stale closure
  const startPointRef = useRef<Point | null>(null)
  const [previewEnd, setPreviewEnd] = useState<Point | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  // For angle tool (3 clicks): accumulate points
  const [anglePoints, setAnglePoints] = useState<Point[]>([])

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeTool || activeTool === 'select') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    const pt = getPoint(e)

    if (activeTool === 'angle') {
      // angle is click-3-times: vertex, arm1, arm2
      setAnglePoints((prev) => {
        const next = [...prev, pt]
        if (next.length === 3) {
          addAnnotation({
            type: 'angle', id: nextId(), frameIndex: currentFrame,
            points: [next[0], next[1], next[2]], style: { ...activeStyle }
          })
          return []
        }
        return next
      })
      return
    }

    // All other tools: drag-based
    startPointRef.current = pt
    setPreviewEnd(pt)
    setIsDrawing(true)
  }, [activeTool, activeStyle, currentFrame, addAnnotation])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || !startPointRef.current) return
    if (activeTool === 'angle') return

    const pt = getPoint(e)

    if (activeTool === 'freehand') {
      setPreviewEnd(pt)
      // For freehand, collect points incrementally
      setAnglePoints((prev) => [...prev, pt])
    } else {
      setPreviewEnd(pt)
    }
  }, [isDrawing, activeTool])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || !startPointRef.current) return
    if (activeTool === 'angle') return

    const start = startPointRef.current
    const end = getPoint(e)
    startPointRef.current = null
    setIsDrawing(false)
    setPreviewEnd(null)

    const dx = end.x - start.x
    const dy = end.y - start.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (activeTool === 'freehand') {
      const pts = anglePoints.length > 1 ? anglePoints : [start, end]
      if (pts.length > 1) {
        addAnnotation({ type: 'freehand', id: nextId(), frameIndex: currentFrame, points: pts, style: { ...activeStyle } })
      }
      setAnglePoints([])
      return
    }

    if (dist < 0.005) return // ignore tiny drags (accidental clicks)

    if (activeTool === 'line') {
      addAnnotation({ type: 'line', id: nextId(), frameIndex: currentFrame, points: [start, end], style: { ...activeStyle } })
    } else if (activeTool === 'arrow') {
      addAnnotation({ type: 'arrow', id: nextId(), frameIndex: currentFrame, points: [start, end], style: { ...activeStyle } })
    } else if (activeTool === 'circle') {
      const radius = Math.sqrt(dx * dx + dy * dy)
      addAnnotation({ type: 'circle', id: nextId(), frameIndex: currentFrame, center: start, radius, style: { ...activeStyle } })
    }
  }, [isDrawing, activeTool, activeStyle, currentFrame, addAnnotation, anglePoints])

  const previewStartPoint = startPointRef.current
  const angleClickPoints = anglePoints

  return {
    isDrawing,
    previewStart: previewStartPoint,
    previewEnd,
    anglePoints: angleClickPoints,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp
  }
}
