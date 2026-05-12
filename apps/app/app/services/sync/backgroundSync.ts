import * as SecureStore from "expo-secure-store"
import { openDatabase, runMigrations } from "../db"
import { setSessionToken } from "../api/noopClient"
import { drainLoop } from "./uplinkDrainer"

export async function runBackgroundDrain(maxMs = 25_000): Promise<{
  ok: boolean
  drained: number
  reason?: string
}> {
  const token = SecureStore.getItem("noop.authToken")
  if (!token) return { ok: false, drained: 0, reason: "no-session" }
  setSessionToken(token)

  await runMigrations()
  const db = openDatabase()

  const { apiPost } = await import("../api/noopClient")
  const { drained } = await drainLoop(db, {
    post: (tableName, payloads) =>
      apiPost("/pipeline/ingest-table", { tableName, rows: payloads }),
    batchSize: 200,
    maxMs,
    holder: "background",
  })
  return { ok: true, drained }
}
