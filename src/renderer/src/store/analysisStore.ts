import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Clip } from '../types/clip'
import type { Annotation, AnnotationLayer, DrawingToolType, AnnotationStyle } from '../types/drawing'

interface AnalysisStore {
  activeClip: Clip | null
  currentFrame: number
  totalFrames: number
  fps: number
  isPlaying: boolean
  playbackSpeed: number

  annotations: AnnotationLayer[]
  activeLayerIndex: number
  activeTool: DrawingToolType | null
  activeStyle: AnnotationStyle

  setActiveClip: (clip: Clip | null) => void
  setCurrentFrame: (frame: number) => void
  setTotalFrames: (n: number) => void
  setFps: (fps: number) => void
  setIsPlaying: (val: boolean) => void
  setPlaybackSpeed: (speed: number) => void

  setActiveTool: (tool: DrawingToolType | null) => void
  setActiveStyle: (style: Partial<AnnotationStyle>) => void
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (annotationId: string) => void
  clearCurrentLayerAnnotations: () => void
}

const defaultLayer: AnnotationLayer = {
  id: 'default',
  name: 'Layer 1',
  annotations: [],
  visible: true
}

const defaultStyle: AnnotationStyle = {
  color: '#22c55e',
  strokeWidth: 2,
  opacity: 1
}

export const useAnalysisStore = create<AnalysisStore>()(
  immer((set) => ({
    activeClip: null,
    currentFrame: 0,
    totalFrames: 0,
    fps: 30,
    isPlaying: false,
    playbackSpeed: 1,

    annotations: [{ ...defaultLayer }],
    activeLayerIndex: 0,
    activeTool: null,
    activeStyle: defaultStyle,

    setActiveClip: (clip) => {
      set((state) => {
        state.activeClip = clip
        state.currentFrame = 0
        state.isPlaying = false
        state.annotations = [{ ...defaultLayer, annotations: clip?.annotations?.[0]?.annotations ?? [] }]
      })
    },

    setCurrentFrame: (frame) => {
      set((state) => {
        state.currentFrame = frame
      })
    },

    setTotalFrames: (n) => {
      set((state) => {
        state.totalFrames = n
      })
    },

    setFps: (fps) => {
      set((state) => {
        state.fps = fps
      })
    },

    setIsPlaying: (val) => {
      set((state) => {
        state.isPlaying = val
      })
    },

    setPlaybackSpeed: (speed) => {
      set((state) => {
        state.playbackSpeed = speed
      })
    },

    setActiveTool: (tool) => {
      set((state) => {
        state.activeTool = tool
      })
    },

    setActiveStyle: (style) => {
      set((state) => {
        Object.assign(state.activeStyle, style)
      })
    },

    addAnnotation: (annotation) => {
      set((state) => {
        state.annotations[state.activeLayerIndex].annotations.push(annotation)
      })
    },

    removeAnnotation: (annotationId) => {
      set((state) => {
        for (const layer of state.annotations) {
          layer.annotations = layer.annotations.filter((a) => a.id !== annotationId)
        }
      })
    },

    clearCurrentLayerAnnotations: () => {
      set((state) => {
        state.annotations[state.activeLayerIndex].annotations = []
      })
    }
  }))
)
