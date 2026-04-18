export interface FrameSample {
  index: number
  timestamp: number
  byteOffset: number
  byteLength: number
  isKeyframe: boolean
  compositionTimestamp: number
}

export interface ScrubberState {
  isLoaded: boolean
  frameCount: number
  fps: number
  duration: number
  currentFrame: number
  isPlaying: boolean
  playbackSpeed: number
}
