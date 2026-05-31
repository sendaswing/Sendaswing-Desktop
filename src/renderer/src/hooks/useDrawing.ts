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

interface UseDrawingOptions {
  frameIndex?: number
  onAddAnnotation?: (ann: Annotation) => void
}

export function useDrawing({ frameIndex: frameIndexProp, onAddAnnotation }: UseDrawingOptions = {}) {
  const { activeTool, activeStyle, currentFrame, addAnnotation } = useAnalysisStore()

  const frameIndex = frameIndexProp ?? currentFrame
  const addAnn = onAddAnnotation ?? addAnnotation

  const startPointRef = useRef<Point | null>(null)
  const [previewEnd, setPreviewEnd] = useState<Point | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [anglePoints, setAnglePoints] = useState<Point[]>([])

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeTool || activeTool === 'select') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    const pt = getPoint(e)

    if (activeTool === 'angle') {
      setAnglePoints((prev) => {
        const next = [...prev, pt]
        if (next.length === 3) {
          addAnn({
            type: 'angle', id: nextId(), frameIndex,
            points: [next[0], next[1], next[2]], style: { ...activeStyle }
          })
          return []
        }
        return next
      })
      return
    }

    startPointRef.current = pt
    setPreviewEnd(pt)
    setIsDrawing(true)
  }, [activeTool, activeStyle, frameIndex, addAnn])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || !startPointRef.current) return
    if (activeTool === 'angle') return

    const pt = getPoint(e)

    if (activeTool === 'freehand') {
      setPreviewEnd(pt)
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
        addAnn({ type: 'freehand', id: nextId(), frameIndex, points: pts, style: { ...activeStyle } })
      }
      setAnglePoints([])
      return
    }

    if (dist < 0.005) return

    if (activeTool === 'line') {
      addAnn({ type: 'line', id: nextId(), frameIndex, points: [start, end], style: { ...activeStyle } })
    } else if (activeTool === 'arrow') {
      addAnn({ type: 'arrow', id: nextId(), frameIndex, points: [start, end], style: { ...activeStyle } })
    } else if (activeTool === 'circle') {
      const radius = Math.sqrt(dx * dx + dy * dy)
      addAnn({ type: 'circle', id: nextId(), frameIndex, center: start, radius, style: { ...activeStyle } })
    }
  }, [isDrawing, activeTool, activeStyle, frameIndex, addAnn, anglePoints])

  return {
    isDrawing,
    previewStart: startPointRef.current,
    previewEnd,
    anglePoints,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp
  }
}
