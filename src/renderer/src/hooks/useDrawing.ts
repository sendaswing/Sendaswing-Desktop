import { useState, useCallback } from 'react'
import { useAnalysisStore } from '../store/analysisStore'
import type { Point, Annotation } from '../types/drawing'
import { calcAngle } from '../lib/drawing/tools'

let annotationIdCounter = 0
const nextId = () => `ann-${++annotationIdCounter}`

export function useDrawing() {
  const { activeTool, activeStyle, currentFrame, addAnnotation } = useAnalysisStore()
  const [inProgressPoints, setInProgressPoints] = useState<Point[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeTool || activeTool === 'select') return
    e.currentTarget.setPointerCapture(e.pointerId)

    const rect = e.currentTarget.getBoundingClientRect()
    const pt: Point = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    }

    if (activeTool === 'freehand') {
      setIsDrawing(true)
      setInProgressPoints([pt])
    } else if (inProgressPoints.length === 0) {
      setInProgressPoints([pt])
      setIsDrawing(true)
    }
  }, [activeTool, inProgressPoints])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || activeTool === 'freehand') {
      if (activeTool === 'freehand' && isDrawing) {
        const rect = e.currentTarget.getBoundingClientRect()
        const pt: Point = {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height
        }
        setInProgressPoints((prev) => [...prev, pt])
      }
    }
  }, [isDrawing, activeTool])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeTool || activeTool === 'select') return

    const rect = e.currentTarget.getBoundingClientRect()
    const pt: Point = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    }

    if (activeTool === 'freehand') {
      const pts = [...inProgressPoints, pt]
      if (pts.length > 1) {
        addAnnotation({ type: 'freehand', id: nextId(), frameIndex: currentFrame, points: pts, style: { ...activeStyle } })
      }
      setIsDrawing(false)
      setInProgressPoints([])
      return
    }

    const newPoints = [...inProgressPoints, pt]

    if (activeTool === 'line' || activeTool === 'arrow') {
      if (newPoints.length >= 2) {
        addAnnotation({
          type: activeTool,
          id: nextId(),
          frameIndex: currentFrame,
          points: [newPoints[0], newPoints[newPoints.length - 1]],
          style: { ...activeStyle }
        })
        setIsDrawing(false)
        setInProgressPoints([])
      } else {
        setInProgressPoints(newPoints)
      }
      return
    }

    if (activeTool === 'circle') {
      if (newPoints.length >= 2) {
        const [center, edge] = [newPoints[0], newPoints[newPoints.length - 1]]
        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2)
        addAnnotation({ type: 'circle', id: nextId(), frameIndex: currentFrame, center, radius, style: { ...activeStyle } })
        setIsDrawing(false)
        setInProgressPoints([])
      } else {
        setInProgressPoints(newPoints)
      }
      return
    }

    if (activeTool === 'angle') {
      if (newPoints.length >= 3) {
        addAnnotation({
          type: 'angle',
          id: nextId(),
          frameIndex: currentFrame,
          points: [newPoints[0], newPoints[1], newPoints[2]],
          style: { ...activeStyle }
        })
        setIsDrawing(false)
        setInProgressPoints([])
      } else {
        setInProgressPoints(newPoints)
      }
    }
  }, [activeTool, inProgressPoints, currentFrame, activeStyle, addAnnotation])

  return { inProgressPoints, isDrawing, handlePointerDown, handlePointerMove, handlePointerUp }
}
