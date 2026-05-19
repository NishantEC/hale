import { createObservable, notifyTable } from "../../app/services/db/observable"

// notifyTable dispatches via queueMicrotask now to avoid running subscriber
// refetches synchronously on the same tick as a write commit.
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe("observable", () => {
  it("notifies subscribers for the notified table only", async () => {
    const subA = jest.fn()
    const subB = jest.fn()
    const unsubA = createObservable("daily_metrics", subA)
    const unsubB = createObservable("sleep_stages", subB)
    notifyTable("daily_metrics")
    await flushMicrotasks()
    expect(subA).toHaveBeenCalledTimes(1)
    expect(subB).toHaveBeenCalledTimes(0)
    unsubA()
    unsubB()
  })

  it("stops notifying after unsubscribe", async () => {
    const sub = jest.fn()
    const unsub = createObservable("daily_metrics", sub)
    unsub()
    notifyTable("daily_metrics")
    await flushMicrotasks()
    expect(sub).toHaveBeenCalledTimes(0)
  })
})
