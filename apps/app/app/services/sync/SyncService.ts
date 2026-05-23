export interface SyncServiceOptions {
  // drainFn may resolve to an outcome object — we don't care here; SyncService
  // is fire-and-forget. SyncContext owns the outcome inspection.
  drainFn: () => Promise<unknown>
  pullFn: () => Promise<void>
  intervalMs: number
}

// Orchestrates periodic uplink drain + on-demand downlink pull.
// start() runs drainFn every intervalMs; refresh() fires drain then pull
// once (used on app foreground and pull-to-refresh).

export class SyncService {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly opts: SyncServiceOptions) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.opts.drainFn().catch((err) => console.warn("[sync] drain failed", err))
    }, this.opts.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async refresh(): Promise<void> {
    await this.opts.drainFn().catch((err) => console.warn("[sync] drain failed", err))
    await this.opts.pullFn().catch((err) => console.warn("[sync] pull failed", err))
  }
}
