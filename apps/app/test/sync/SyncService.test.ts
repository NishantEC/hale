import { SyncService } from "../../app/services/sync/SyncService"

describe("SyncService", () => {
  jest.useFakeTimers()

  it("calls drainFn every interval while started", () => {
    const drainFn = jest.fn().mockResolvedValue(undefined)
    const svc = new SyncService({ drainFn, pullFn: jest.fn(), intervalMs: 5000 })
    svc.start()
    expect(drainFn).toHaveBeenCalledTimes(0)
    jest.advanceTimersByTime(5000)
    expect(drainFn).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(5000)
    expect(drainFn).toHaveBeenCalledTimes(2)
    svc.stop()
    jest.advanceTimersByTime(10000)
    expect(drainFn).toHaveBeenCalledTimes(2)
  })

  it("refresh() triggers both drain and pull once", async () => {
    const drainFn = jest.fn().mockResolvedValue(undefined)
    const pullFn = jest.fn().mockResolvedValue(undefined)
    const svc = new SyncService({ drainFn, pullFn, intervalMs: 5000 })
    await svc.refresh()
    expect(drainFn).toHaveBeenCalledTimes(1)
    expect(pullFn).toHaveBeenCalledTimes(1)
  })
})
