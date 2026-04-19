export class FrameCache {
  private cache = new Map<number, ImageBitmap>()
  private accessOrder: number[] = []
  private maxSize: number

  constructor(maxSize = 120) {
    this.maxSize = maxSize
  }

  get(frameIndex: number): ImageBitmap | undefined {
    const bmp = this.cache.get(frameIndex)
    if (bmp) {
      const pos = this.accessOrder.indexOf(frameIndex)
      if (pos !== -1) this.accessOrder.splice(pos, 1)
      this.accessOrder.push(frameIndex)
    }
    return bmp
  }

  put(frameIndex: number, bitmap: ImageBitmap): void {
    if (this.cache.has(frameIndex)) {
      const existing = this.cache.get(frameIndex)!
      existing.close()
    }

    this.cache.set(frameIndex, bitmap)
    this.accessOrder.push(frameIndex)

    while (this.cache.size > this.maxSize) {
      const evict = this.accessOrder.shift()!
      const bmp = this.cache.get(evict)
      if (bmp) bmp.close()
      this.cache.delete(evict)
    }
  }

  has(frameIndex: number): boolean {
    return this.cache.has(frameIndex)
  }

  clear(): void {
    for (const bmp of this.cache.values()) bmp.close()
    this.cache.clear()
    this.accessOrder = []
  }

  get size(): number {
    return this.cache.size
  }
}
