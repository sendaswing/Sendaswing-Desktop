import { useReducer, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import type { DrawingToolType } from '../types/drawing'

interface TransformState {
  zoom: number
  panX: number
  panY: number
}

type Action =
  | { type: 'zoom'; zoom: number; panX: number; panY: number }
  | { type: 'pan'; panX: number; panY: number }
  | { type: 'reset' }

function reducer(_: TransformState, action: Action): TransformState {
  switch (action.type) {
    case 'zoom': return { zoom: action.zoom, panX: action.panX, panY: action.panY }
    case 'pan': return { zoom: _.zoom, panX: action.panX, panY: action.panY }
    case 'reset': return { zoom: 1, panX: 0, panY: 0 }
  }
}

export function useViewTransform(getActiveTool: () => DrawingToolType | null) {
  const [state, dispatch] = useReducer(reducer, { zoom: 1, panX: 0, panY: 0 })
  const stateRef = useRef(state)
  stateRef.current = state

  const containerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const [isPanning, setIsPanning] = useReducer((_: boolean, v: boolean) => v, false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panOriginRef = useRef({ x: 0, y: 0 })

  // Native wheel listener so we can call preventDefault (React wheel is passive)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const { zoom, panX, panY } = stateRef.current
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const newZoom = Math.max(0.5, Math.min(8, zoom * factor))
      const ratio = newZoom / zoom
      dispatch({
        type: 'zoom',
        zoom: newZoom,
        panX: mx - (mx - panX) * ratio,
        panY: my - (my - panY) * ratio,
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handlePointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const activeTool = getActiveTool()
    const shouldPan = e.button === 1 || (e.button === 0 && (!activeTool || activeTool === 'select'))
    if (!shouldPan) return
    e.preventDefault()
    e.stopPropagation()
    isPanningRef.current = true
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY }
    panOriginRef.current = { x: stateRef.current.panX, y: stateRef.current.panY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [getActiveTool])

  const handlePointerMoveCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    dispatch({ type: 'pan', panX: panOriginRef.current.x + dx, panY: panOriginRef.current.y + dy })
  }, [])

  const handlePointerUpCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return
    isPanningRef.current = false
    setIsPanning(false)
  }, [])

  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  const isAtDefault = state.zoom === 1 && state.panX === 0 && state.panY === 0

  const viewportStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    transformOrigin: '0 0',
    transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`,
  }

  return {
    containerRef,
    viewportStyle,
    handlePointerDownCapture,
    handlePointerMoveCapture,
    handlePointerUpCapture,
    reset,
    isAtDefault,
    isPanning,
  }
}
