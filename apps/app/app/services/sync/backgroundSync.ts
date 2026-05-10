import AsyncStorage from "@react-native-async-storage/async-storage"
import { openDatabase, runMigrations } from "../db"
import { queueDepth } from "../db/repositories/outboundQueue"
import { apiPost, setSessionToken } from "../api/noopClient"
import { drainOnce } from "./uplinkDrainer"

export async function runBackgroundDrain(maxMs = 25_000): Promise<{
  ok: boolean
  drained: number
  reason?: string
}> {
  const token = await AsyncStorage.getItem("sessionToken")
  if (!token) return { ok: false, drained: 0, reason: "no-session" }
  setSessionToken(token)

  await runMigrations()
  const db = openDatabase()

  const deadline = Date.now() + maxMs
  let totalDrained = 0
  while (Date.now() < deadline) {
    const before = await queueDepth(db)
    if (before === 0) break
    await drainOnce(db, {
      post: (tableName, payloads) =>
        apiPost(`/pipeline/ingest-table`, { tableName, rows: payloads }),
      batchSize: 200,
    })
    const after = await queueDepth(db)
    totalDrained += Math.max(0, before - after)
    if (after >= before) break
  }
  return { ok: true, drained: totalDrained }
}
