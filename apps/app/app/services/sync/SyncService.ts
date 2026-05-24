type DrainOutcomeLike = { error: string | null; skipped?: "locked" | null } | null | void

export interface SyncServiceOptions {
  // drainFn returns an outcome (or null when drain was a no-op).
  // refresh() inspects the outcome to decide whether to follow up with pullFn.
  drainFn: () => Promise<DrainOutcomeLike>
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
    let outcome: DrainOutcomeLike
    try {
      outcome = await this.opts.drainFn()
    } catch (err) {
      console.warn("[sync] drain threw", err)
      return
    }
    // Drain catches its own infrastructure errors and resolves with the
    // outcome. Skip pull if drain reported an error (backend likely still
    // sick) or got locked out (a concurrent drain is already in flight).
    if (outcome && (outcome.error != null || outcome.skipped === "locked")) {
      console.warn("[sync] skipping pull — drain outcome:", outcome)
      return
    }
    await this.opts.pullFn().catch((err) => console.warn("[sync] pull failed", err))
  }
}
