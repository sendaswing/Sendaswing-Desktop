/**
 * FrameCache — LRU cache of decoded frames, bounded by a MEMORY budget rather
 * than a frame count. A 1080p ImageBitmap is ~8 MB, so counting frames alone
 * let a single high-fps clip try to hold many gigabytes.
 *
 * Map insertion order is used as the LRU order: `get` re-inserts the entry so
 * the least-recently-used frame is always the first key.
 */

/** Default budget for decoded frames, in bytes. */
export const DEFAULT_FRAME_BUDGET_BYTES = 1.5 * 1024 * 1024 * 1024

/** Bytes a decoded RGBA frame of the given dimensions occupies. */
export function frameBytes(width: number, height: number): number {
  return Math.max(1, width) * Math.max(1, height) * 4
}

export class FrameCache {
  private cache = new Map<number, ImageBitmap>()
  private bytesUsed = 0
  private budgetBytes: number

  constructor(budgetBytes = DEFAULT_FRAME_BUDGET_BYTES) {
    this.budgetBytes = budgetBytes
  }

  /** Change the memory budget; evicts immediately if over. */
  setBudget(bytes: number): void {
    this.budgetBytes = Math.max(bytes, 0)
    this.evictToBudget()
  }

  get budget(): number {
    return this.budgetBytes
  }

  /** How many frames of the given size fit in the budget (at least 1). */
  capacityFor(width: number, height: number): number {
    return Math.max(1, Math.floor(this.budgetBytes / frameBytes(width, height)))
  }

  get(frameIndex: number): ImageBitmap | undefined {
    const bmp = this.cache.get(frameIndex)
    if (bmp) {
      // Move to most-recently-used position
      this.cache.delete(frameIndex)
      this.cache.set(frameIndex, bmp)
    }
    return bmp
  }

  /** Peek without touching LRU order. */
  has(frameIndex: number): boolean {
    return this.cache.has(frameIndex)
  }

  put(frameIndex: number, bitmap: ImageBitmap): void {
    const existing = this.cache.get(frameIndex)
    if (existing) {
      this.bytesUsed -= frameBytes(existing.width, existing.height)
      existing.close()
      this.cache.delete(frameIndex)
    }

    this.cache.set(frameIndex, bitmap)
    this.bytesUsed += frameBytes(bitmap.width, bitmap.height)

    // Evict least-recently-used frames until within budget, but never the
    // frame we just inserted.
    for (const key of this.cache.keys()) {
      if (this.bytesUsed <= this.budgetBytes) break
      if (key === frameIndex) continue
      this.remove(key)
    }
  }

  private remove(frameIndex: number): void {
    const bmp = this.cache.get(frameIndex)
    if (!bmp) return
    this.bytesUsed -= frameBytes(bmp.width, bmp.height)
    bmp.close()
    this.cache.delete(frameIndex)
  }

  private evictToBudget(): void {
    for (const key of Array.from(this.cache.keys())) {
      if (this.bytesUsed <= this.budgetBytes) break
      this.remove(key)
    }
  }

  clear(): void {
    for (const bmp of this.cache.values()) bmp.close()
    this.cache.clear()
    this.bytesUsed = 0
  }

  get size(): number {
    return this.cache.size
  }

  get bytes(): number {
    return this.bytesUsed
  }
}
