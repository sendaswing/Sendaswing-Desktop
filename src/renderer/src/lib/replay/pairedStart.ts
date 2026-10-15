/**
 * pairedStart — makes the two Analyze panels start playing at the same moment.
 *
 * After a two-camera buffered swing, FO opens on the left and DL on the right.
 * Each panel loads its clip on its own schedule, so left alone they would start
 * playing a second or so apart. Instead, BufferedCaptureController calls
 * expect([fo, dl]) before opening them; each panel, once loaded, calls hold()
 * and waits on frame 0. When both are ready (or after a timeout, so a slow or
 * failed load never blocks the other) they all start together.
 */

type Starter = () => void

/** Longest a loaded panel waits for its partner before playing anyway. */
const MAX_WAIT_MS = 6000

class PairedStart {
  private expected: string[] = []
  private starters = new Map<string, Starter>()
  private timer: ReturnType<typeof setTimeout> | null = null

  /** The next loads of these files should start together. */
  expect(filePaths: string[]): void {
    // Anything still waiting from a previous group plays now rather than hanging
    if (this.starters.size) this.fire()
    this.reset()
    this.expected = filePaths.length > 1 ? [...filePaths] : []
  }

  /**
   * Called by a player once its clip is loaded. Returns true if the player
   * should wait; `start` is then called when the whole group is ready.
   * Returns false if this file isn't part of a pending group (play right away).
   */
  hold(filePath: string, start: Starter): boolean {
    if (!this.expected.includes(filePath)) return false
    this.starters.set(filePath, start)
    if (this.starters.size >= this.expected.length) {
      this.fire()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.fire(), MAX_WAIT_MS)
    }
    return true
  }

  private fire(): void {
    const starters = [...this.starters.values()]
    this.reset()
    for (const start of starters) start()
  }

  private reset(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.starters.clear()
    this.expected = []
  }
}

export const pairedStart = new PairedStart()
