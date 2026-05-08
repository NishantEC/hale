import { createObservable, notifyTable } from "../../app/services/db/observable"

describe("observable", () => {
  it("notifies subscribers for the notified table only", () => {
    const subA = jest.fn()
    const subB = jest.fn()
    const unsubA = createObservable("daily_metrics", subA)
    const unsubB = createObservable("sleep_stages", subB)
    notifyTable("daily_metrics")
    expect(subA).toHaveBeenCalledTimes(1)
    expect(subB).toHaveBeenCalledTimes(0)
    unsubA()
    unsubB()
  })

  it("stops notifying after unsubscribe", () => {
    const sub = jest.fn()
    const unsub = createObservable("daily_metrics", sub)
    unsub()
    notifyTable("daily_metrics")
    expect(sub).toHaveBeenCalledTimes(0)
  })
})
