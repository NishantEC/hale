// Append-only, daily-rolled log file under documentDirectory/noop-logs/.
// Survives app restart so we can see what happened in the lead-up to a
// data gap or a crash. console.log is fine for "what's happening now" —
// this is for "what happened a minute ago when the app got killed."
//
// Design choices:
// - One file per IST day (YYYY-MM-DD.log). Roll on midnight or first
//   write of a new day.
// - 7-day retention. Older files are deleted on first write of each day.
// - ~10 MB total cap (rough — we don't track size precisely). If a single
//   day grows past 5 MB we trim it down by half from the head.
// - Writes are queued via an in-memory FIFO so concurrent appendLog
//   callers can't interleave their lines.
// - Categories: sync, daemon, ble, api, persist, pipeline, ui.
// - Format: "<ISO> <LEVEL> <CATEGORY> <message> <meta-json>"

// expo-file-system v55 moved the imperative API to the legacy module —
// the top-level export is the new File/Directory API. We use the legacy
// readAsStringAsync / writeAsStringAsync / getInfoAsync.
import * as FileSystem from "expo-file-system/legacy"

export type LogLevel = "info" | "warn" | "error"
export type LogCategory =
  | "sync"
  | "daemon"
  | "ble"
  | "api"
  | "persist"
  | "pipeline"
  | "ui"

const LOG_DIR = `${FileSystem.documentDirectory ?? ""}noop-logs`
const RETENTION_DAYS = 7
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB per day before trim

let writeQueue: Promise<void> = Promise.resolve()
let initialized = false

function todayKey(): string {
  // IST-local day key. Match the existing IST-bucketing convention.
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

function logPath(dateKey: string): string {
  return `${LOG_DIR}/${dateKey}.log`
}

async function ensureDir(): Promise<void> {
  if (initialized) return
  try {
    const info = await FileSystem.getInfoAsync(LOG_DIR)
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(LOG_DIR, { intermediates: true })
    }
    initialized = true
  } catch (err) {
    console.warn("[persistentLog] ensureDir failed", err)
  }
}

async function pruneOldDays(): Promise<void> {
  try {
    const entries = await FileSystem.readDirectoryAsync(LOG_DIR)
    const todayMs = Date.parse(`${todayKey()}T00:00:00Z`)
    for (const name of entries) {
      if (!name.endsWith(".log")) continue
      const dateKey = name.slice(0, 10)
      const fileMs = Date.parse(`${dateKey}T00:00:00Z`)
      if (Number.isNaN(fileMs)) continue
      const ageDays = (todayMs - fileMs) / (24 * 60 * 60 * 1000)
      if (ageDays > RETENTION_DAYS) {
        await FileSystem.deleteAsync(logPath(dateKey), { idempotent: true })
      }
    }
  } catch (err) {
    console.warn("[persistentLog] pruneOldDays failed", err)
  }
}

async function trimIfOversize(path: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(path)
    if (!info.exists) return
    const size = "size" in info ? (info.size ?? 0) : 0
    if (size <= MAX_FILE_BYTES) return
    // Read full file, drop the older half, rewrite. Cheap enough at 5MB.
    const contents = await FileSystem.readAsStringAsync(path)
    const half = Math.floor(contents.length / 2)
    const nlIdx = contents.indexOf("\n", half)
    const trimmed = nlIdx === -1 ? contents.slice(half) : contents.slice(nlIdx + 1)
    await FileSystem.writeAsStringAsync(path, trimmed)
  } catch (err) {
    console.warn("[persistentLog] trimIfOversize failed", err)
  }
}

function formatLine(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ""
  return `${ts} ${level.toUpperCase()} ${category} ${message}${metaStr}\n`
}

export function appendLog(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const line = formatLine(level, category, message, meta)
  writeQueue = writeQueue
    .then(async () => {
      await ensureDir()
      const path = logPath(todayKey())
      // First write of the day: prune old + trim oversize.
      const info = await FileSystem.getInfoAsync(path)
      if (!info.exists) {
        await pruneOldDays()
      } else {
        await trimIfOversize(path)
      }
      // expo-file-system 55 has no append API — read+rewrite is the
      // documented workaround. Daily roll keeps file size bounded so
      // the cost is fine (<5MB per day).
      const existing = info.exists ? await FileSystem.readAsStringAsync(path) : ""
      await FileSystem.writeAsStringAsync(path, existing + line)
    })
    .catch((err) => {
      console.warn("[persistentLog] write failed", err)
    })
}

export async function readRecentLogLines(maxLines = 200): Promise<string[]> {
  await ensureDir()
  const path = logPath(todayKey())
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) return []
  const contents = await FileSystem.readAsStringAsync(path)
  const lines = contents.split("\n").filter((l) => l.length > 0)
  return lines.slice(-maxLines).reverse() // newest first for the Inspector
}

// Read every line from today's log file. No cap. Inspector uses this so
// "copy" yields the whole thing — partial logs were useless for the
// strap-cursor investigation where the gap could span 30+ minutes of events.
export async function readAllTodayLogLines(): Promise<string[]> {
  await ensureDir()
  const path = logPath(todayKey())
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) return []
  const contents = await FileSystem.readAsStringAsync(path)
  return contents.split("\n").filter((l) => l.length > 0).reverse()
}

// Returns the file path of today's log, or null if it doesn't exist yet.
// Used by the "Export" button to hand the file to iOS share sheet.
export async function getTodayLogPath(): Promise<string | null> {
  await ensureDir()
  const path = logPath(todayKey())
  const info = await FileSystem.getInfoAsync(path)
  return info.exists ? path : null
}
