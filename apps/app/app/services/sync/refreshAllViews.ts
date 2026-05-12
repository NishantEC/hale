import type { NoopDatabase } from "../db"
import { setViewCache } from "../db/repositories/viewCache"
import { apiGet, deviceDateKey, deviceTimeZone } from "../api/noopClient"

export async function refreshAllViews(db: NoopDatabase): Promise<void> {
  const today = deviceDateKey()
  const timeZone = encodeURIComponent(deviceTimeZone())
  try {
    const [home, sleep, trends] = await Promise.all([
      apiGet(`/views/home?date=${today}&timeZone=${timeZone}`),
      apiGet(`/views/sleep?date=${today}&timeZone=${timeZone}`),
      apiGet(`/views/trends?days=30`),
    ])
    await setViewCache(db, "home", today, home)
    await setViewCache(db, "sleep", today, sleep)
    await setViewCache(db, "trends", "30d", trends)
  } catch (err) {
    console.warn("[sync] view cache refresh failed", err)
  }
}
