export function makeSemaphore(max: number) {
  let running = 0
  const queue: Array<() => void> = []
  return {
    acquire(): Promise<void> {
      return new Promise((resolve) => {
        if (running < max) { running++; resolve() }
        else queue.push(resolve)
      })
    },
    release() {
      running--
      const next = queue.shift()
      if (next) { running++; next() }
    }
  }
}
