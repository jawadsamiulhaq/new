/**
 * Counter alarm for new orders. Browsers only allow sound after a tap, so staff press
 * "Start shift" once; that also keeps the tablet's screen awake while the board is open.
 * The tone is generated with Web Audio — no sound file to host.
 */
class Ringer {
  private context: AudioContext | null = null
  private timer: number | null = null
  private wakeLock: WakeLockSentinel | null = null
  private listeners = new Set<() => void>()

  get started() {
    return this.context !== null
  }

  get ringing() {
    return this.timer !== null
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }

  /** Must be called from a click/tap. */
  async start() {
    this.context ??= new AudioContext()
    await this.context.resume()
    await this.keepAwake()
    document.addEventListener('visibilitychange', this.onVisibility)
    this.chime() // confirms sound works
    this.emit()
  }

  private onVisibility = () => {
    // The wake lock is released when the tab is hidden; take it again when staff come back.
    if (document.visibilityState === 'visible' && this.started) void this.keepAwake()
  }

  private async keepAwake() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen')
        this.wakeLock.addEventListener('release', () => (this.wakeLock = null))
      }
    } catch {
      /* not supported or denied — the board still works */
    }
  }

  /** Rings repeatedly until stopped (called while any order is waiting to be accepted). */
  setRinging(on: boolean) {
    if (on && this.timer === null && this.context) {
      this.chime()
      this.timer = window.setInterval(() => this.chime(), 2500)
      this.emit()
    } else if (!on && this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
      this.emit()
    }
  }

  /** Three bright rising notes. */
  private chime() {
    const ctx = this.context
    if (!ctx) return
    const notes = [880, 1108.73, 1318.51]
    notes.forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.18
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.6, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    })
  }
}

export const ringer = new Ringer()
