import * as SecureStore from "expo-secure-store"
import { openDatabase, runMigrations, type NoopDatabase } from "../db"
import { setSessionToken } from "../api/noopClient"
import { drainLoop } from "./uplinkDrainer"
import type { DrainLoopOutcome } from "./uplinkDrainer"

export type BackgroundDrainOutcome =
  | { status: "no-session" }
  | { status: "drained"; outcome: DrainLoopOutcome }

// One-shot entry: opens DB, runs migrations, drains once. Used by iOS
// catchup task and BLE-restoration paths that don't have a long-lived db.
export async function runBackgroundDrain(maxMs = 25_000): Promise<BackgroundDrainOutcome> {
  const token = SecureStore.getItem("noop.authToken")
  if (!token) return { status: "no-session" }
  setSessionToken(token)
  await runMigrations()
  const db = openDatabase()
  return runBackgroundDrainWith(db, maxMs)
}

// Hot-loop entry: caller owns DB + migrations. Used by the Android FGS so the
// 30s loop doesn't re-scan drizzle's migrations journal on every tick.
export async function runBackgroundDrainWith(
  db: NoopDatabase,
  maxMs = 25_000,
): Promise<BackgroundDrainOutcome> {
  const { apiPost } = await import("../api/noopClient")
  const outcome = await drainLoop(db, {
    post: (tableName, payloads) =>
      apiPost("/pipeline/ingest-table", { tableName, rows: payloads }, 60_000),
    batchSize: 200,
    maxMs,
    holder: "background",
  })
  return { status: "drained", outcome }
}
