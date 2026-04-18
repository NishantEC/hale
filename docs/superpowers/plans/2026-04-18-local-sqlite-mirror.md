# Local SQLite Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Expo app a durable on-device SQLite database that mirrors every WHOOP watch event and every derived backend value the UI renders.

**Architecture:** Write-local-first with a durable outbound queue that drains to the backend. Derived backend results pulled back into SQLite on app foreground / pull-to-refresh. Screens read exclusively from the local DB via repository functions.

**Tech Stack:** expo-sqlite, drizzle-orm, drizzle-kit, TypeScript, Jest, Expo SDK 55.

**Branch:** `feat/local-sqlite-mirror` (create from `main`).

**Spec:** `docs/superpowers/specs/2026-04-18-local-sqlite-mirror-design.md`

---

## Phase 1 — DB scaffolding

### Task 1: Install dependencies and configure drizzle-kit

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/package.json`
- Create: `/Users/nishantgupta/Documents/noop/app/drizzle.config.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/drizzleConfig.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/drizzleConfig.test.ts`:

```typescript
import fs from "fs"
import path from "path"

describe("drizzle-kit configuration", () => {
  const root = path.resolve(__dirname, "..", "..")

  it("exists at ./drizzle.config.ts and targets expo sqlite", () => {
    const cfg = path.resolve(root, "drizzle.config.ts")
    expect(fs.existsSync(cfg)).toBe(true)
    const src = fs.readFileSync(cfg, "utf8")
    expect(src).toContain('dialect: "sqlite"')
    expect(src).toContain('driver: "expo"')
    expect(src).toContain("./app/services/db/schema.ts")
    expect(src).toContain("./app/services/db/migrations")
  })

  it("declares the runtime and devtool packages + db:generate script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(root, "package.json"), "utf8"))
    expect(pkg.dependencies["expo-sqlite"]).toBeDefined()
    expect(pkg.dependencies["drizzle-orm"]).toBeDefined()
    expect(pkg.devDependencies["drizzle-kit"]).toBeDefined()
    expect(pkg.scripts["db:generate"]).toBe("drizzle-kit generate")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/drizzleConfig.test.ts`
Expected: FAIL — `expect(fs.existsSync(cfg)).toBe(true)` fails because `drizzle.config.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Install packages:

```bash
cd /Users/nishantgupta/Documents/noop/app && npx expo install expo-sqlite && npm install drizzle-orm && npm install --save-dev drizzle-kit
```

Add to `package.json` `"scripts"` (preserve existing scripts):

```json
"db:generate": "drizzle-kit generate",
"db:check": "drizzle-kit check"
```

Create `/Users/nishantgupta/Documents/noop/app/drizzle.config.ts`:

```typescript
import type { Config } from "drizzle-kit"

export default {
  schema: "./app/services/db/schema.ts",
  out: "./app/services/db/migrations",
  dialect: "sqlite",
  driver: "expo",
} satisfies Config
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/drizzleConfig.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/package.json app/package-lock.json app/drizzle.config.ts app/test/db/drizzleConfig.test.ts
git commit -m "feat(db): add expo-sqlite + drizzle-kit deps and config"
```

---

### Task 2: Define the Drizzle schema (every mirrored + sync-tracking table)

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/schema.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/schema.test.ts`:

```typescript
import * as schema from "../../app/services/db/schema"

describe("drizzle schema", () => {
  const expectedTables = [
    "rawSensorRecords",
    "realtimeSamples",
    "deviceEvents",
    "consoleLogs",
    "journalEntries",
    "dailyMetrics",
    "dailyScores",
    "sleepDetections",
    "sleepStages",
    "nightFeatures",
    "signalSamples",
    "activityDetections",
    "baselineProfile",
    "sleepPlans",
    "viewCache",
    "outboundQueue",
    "syncState",
    "settings",
  ]

  it("exports every required table", () => {
    for (const name of expectedTables) {
      expect((schema as any)[name]).toBeDefined()
    }
  })

  it("mirrored tables include _syncedAt, _localCreatedAt, _origin, userId", () => {
    const mirrored = [
      "rawSensorRecords",
      "realtimeSamples",
      "deviceEvents",
      "consoleLogs",
      "journalEntries",
      "dailyMetrics",
      "dailyScores",
      "sleepDetections",
      "sleepStages",
      "nightFeatures",
      "signalSamples",
      "activityDetections",
      "baselineProfile",
      "sleepPlans",
    ]
    for (const name of mirrored) {
      const table: any = (schema as any)[name]
      expect(table._.columns._syncedAt).toBeDefined()
      expect(table._.columns._localCreatedAt).toBeDefined()
      expect(table._.columns._origin).toBeDefined()
      expect(table._.columns.userId).toBeDefined()
    }
  })

  it("outboundQueue has all drainer columns", () => {
    const t: any = (schema as any).outboundQueue
    for (const col of [
      "id",
      "tableName",
      "rowId",
      "payload",
      "attempts",
      "lastAttemptAt",
      "lastError",
      "createdAt",
    ]) {
      expect(t._.columns[col]).toBeDefined()
    }
  })

  it("syncState stores per-table lastSyncAt", () => {
    const t: any = (schema as any).syncState
    expect(t._.columns.tableName).toBeDefined()
    expect(t._.columns.lastSyncAt).toBeDefined()
    expect(t._.columns.lastSyncedRowTimestamp).toBeDefined()
  })

  it("viewCache keys by viewName + date + userId", () => {
    const t: any = (schema as any).viewCache
    expect(t._.columns.viewName).toBeDefined()
    expect(t._.columns.date).toBeDefined()
    expect(t._.columns.payload).toBeDefined()
    expect(t._.columns.updatedAt).toBeDefined()
    expect(t._.columns.userId).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/schema.test.ts`
Expected: FAIL — `Cannot find module '../../app/services/db/schema'`.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/schema.ts`:

```typescript
import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core"

// ── Shared mirror columns ─────────────────────────────────
// _syncedAt       — unix ms when backend ack'd this row (null = pending uplink)
// _localCreatedAt — unix ms when the app first wrote the row
// _origin         — "local" (app wrote it) | "backend" (downlink pulled it)
// userId          — the user this row belongs to; wipe-on-logout uses this column

const mirrorColumns = {
  _syncedAt: integer("_synced_at"),
  _localCreatedAt: integer("_local_created_at").notNull(),
  _origin: text("_origin", { enum: ["local", "backend"] }).notNull(),
  userId: text("user_id").notNull(),
}

// ── Uplink (local-origin) tables ──────────────────────────

export const rawSensorRecords = sqliteTable("raw_sensor_records", {
  id: text("id").primaryKey(),
  timestamp: integer("timestamp").notNull(),
  heartRate: real("heart_rate").notNull().default(0),
  rrAverageMs: real("rr_average_ms"),
  spo2Red: real("spo2_red"),
  spo2IR: real("spo2_ir"),
  skinTempRaw: real("skin_temp_raw"),
  gravityMagnitude: real("gravity_magnitude"),
  gravityX: real("gravity_x"),
  gravityY: real("gravity_y"),
  gravityZ: real("gravity_z"),
  respRateRaw: real("resp_rate_raw"),
  skinContact: integer("skin_contact"),
  ppgGreen: real("ppg_green"),
  ppgRedIr: real("ppg_red_ir"),
  ambientLight: real("ambient_light"),
  ledDrive1: real("led_drive_1"),
  ledDrive2: real("led_drive_2"),
  signalQuality: real("signal_quality"),
  ...mirrorColumns,
})

export const realtimeSamples = sqliteTable("realtime_samples", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  sessionId: text("session_id").notNull(),
  dataType: text("data_type").notNull(),
  heartRate: integer("heart_rate"),
  rawFields: text("raw_fields"),
  rawPayload: text("raw_payload"),
  capturedAt: integer("captured_at").notNull(),
  ...mirrorColumns,
})

export const deviceEvents = sqliteTable("device_events", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  eventNumber: integer("event_number").notNull(),
  eventName: text("event_name").notNull(),
  rawPayload: text("raw_payload"),
  capturedAt: integer("captured_at").notNull(),
  ...mirrorColumns,
})

export const consoleLogs = sqliteTable("console_logs", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  message: text("message").notNull(),
  logLevel: text("log_level"),
  metadata: text("metadata"),
  capturedAt: integer("captured_at").notNull(),
  ...mirrorColumns,
})

export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  timestamp: integer("timestamp").notNull(),
  factorTag: text("factor_tag").notNull(),
  intensity: integer("intensity").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  ...mirrorColumns,
})

// ── Downlink (backend-origin) tables ──────────────────────

export const dailyMetrics = sqliteTable("daily_metrics", {
  id: text("id").primaryKey(),
  dayDate: integer("day_date").notNull(),
  stressAverage: real("stress_average"),
  spo2Average: real("spo2_average"),
  skinTempAvgCelsius: real("skin_temp_avg_celsius"),
  skinTempDeltaCelsius: real("skin_temp_delta_celsius"),
  strainScore: real("strain_score"),
  sleepConsistencyScore: real("sleep_consistency_score"),
  detectedSleepNights: integer("detected_sleep_nights").notNull().default(0),
  lfHfRatioAverage: real("lf_hf_ratio_average"),
  recoveryIndex: real("recovery_index"),
  trainingLoadRatio: real("training_load_ratio"),
  trainingLoadRiskZone: text("training_load_risk_zone"),
  spo2DipCount: integer("spo2_dip_count"),
  odiPerHour: real("odi_per_hour"),
  lowestSpo2: real("lowest_spo2"),
  coreTemperatureEstimate: real("core_temperature_estimate"),
  circadianNadir: integer("circadian_nadir"),
  sleepArchitectureScore: real("sleep_architecture_score"),
  activeMinutes: real("active_minutes"),
  activityCount: integer("activity_count"),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const dailyScores = sqliteTable("daily_scores", {
  id: text("id").primaryKey(),
  dayDate: integer("day_date").notNull(),
  dailyBalance: integer("daily_balance").notNull().default(0),
  loadPressure: integer("load_pressure").notNull().default(0),
  sleepReserveHours: real("sleep_reserve_hours").notNull().default(0),
  confidence: text("confidence").notNull().default("Low"),
  recommendation: text("recommendation").notNull().default("Steady"),
  detail: text("detail").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const sleepDetections = sqliteTable("sleep_detections", {
  id: text("id").primaryKey(),
  nightDate: integer("night_date").notNull(),
  bedtime: integer("bedtime"),
  wakeTime: integer("wake_time"),
  durationHours: real("duration_hours").notNull().default(0),
  interruptionCount: integer("interruption_count").notNull().default(0),
  continuity: real("continuity").notNull().default(0),
  regularity: real("regularity").notNull().default(0),
  validCoverage: real("valid_coverage").notNull().default(0),
  confidence: real("confidence").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const sleepStages = sqliteTable("sleep_stages", {
  id: text("id").primaryKey(),
  nightDate: integer("night_date").notNull(),
  remMinutes: integer("rem_minutes").notNull().default(0),
  coreMinutes: integer("core_minutes").notNull().default(0),
  deepMinutes: integer("deep_minutes").notNull().default(0),
  awakeMinutes: integer("awake_minutes").notNull().default(0),
  unknownMinutes: integer("unknown_minutes").notNull().default(0),
  confidence: real("confidence").notNull().default(0),
  source: text("source").notNull().default("Strap"),
  epochTimeline: text("epoch_timeline"),
  epochMinutes: integer("epoch_minutes").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const nightFeatures = sqliteTable("night_features", {
  id: text("id").primaryKey(),
  nightDate: integer("night_date").notNull(),
  restingHeartRate: real("resting_heart_rate").notNull().default(0),
  rmssd: real("rmssd").notNull().default(0),
  sdnn: real("sdnn").notNull().default(0),
  respiratoryRate: real("respiratory_rate").notNull().default(0),
  continuity: real("continuity").notNull().default(0),
  regularity: real("regularity").notNull().default(0),
  validCoverage: real("valid_coverage").notNull().default(0),
  confidenceRaw: real("confidence_raw").notNull().default(0),
  sleepEstimateHours: real("sleep_estimate_hours").notNull().default(0),
  sourceBlend: text("source_blend").notNull().default("Unknown"),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const signalSamples = sqliteTable("signal_samples", {
  id: text("id").primaryKey(),
  timestamp: integer("timestamp").notNull(),
  source: text("source").notNull().default("strap"),
  heartRate: real("heart_rate"),
  ibiMs: real("ibi_ms"),
  motionScore: real("motion_score"),
  qualityScore: real("quality_score"),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const activityDetections = sqliteTable("activity_detections", {
  id: text("id").primaryKey(),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  durationMinutes: real("duration_minutes").notNull(),
  activityType: text("activity_type").notNull(),
  intensity: text("intensity").notNull(),
  confidence: real("confidence").notNull(),
  heartRateAvg: real("heart_rate_avg").notNull(),
  heartRateMax: real("heart_rate_max").notNull(),
  strainScore: real("strain_score").notNull(),
  cadenceHz: real("cadence_hz"),
  source: text("source").notNull().default("detected"),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const baselineProfile = sqliteTable("baseline_profile", {
  id: text("id").primaryKey(),
  restingHeartRate: real("resting_heart_rate").notNull().default(0),
  rmssd: real("rmssd").notNull().default(0),
  sdnn: real("sdnn").notNull().default(0),
  nightsUsed: integer("nights_used").notNull().default(0),
  maxHeartRate: real("max_heart_rate"),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

export const sleepPlans = sqliteTable("sleep_plans", {
  id: text("id").primaryKey(),
  targetSleepMinutes: integer("target_sleep_minutes").notNull().default(480),
  wakeMinutes: integer("wake_minutes").notNull().default(420),
  alarmEnabled: integer("alarm_enabled").notNull().default(0),
  alarmMinutes: integer("alarm_minutes").notNull().default(420),
  smartWakeEnabled: integer("smart_wake_enabled").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
  ...mirrorColumns,
})

// ── View-model cache (local-only) ─────────────────────────

export const viewCache = sqliteTable(
  "view_cache",
  {
    viewName: text("view_name").notNull(),
    date: text("date").notNull(),
    payload: text("payload").notNull(),
    updatedAt: integer("updated_at").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.viewName, t.date, t.userId] }) }),
)

// ── Sync-tracking (local-only) ────────────────────────────

export const outboundQueue = sqliteTable("outbound_queue", {
  id: text("id").primaryKey(),
  tableName: text("table_name").notNull(),
  rowId: text("row_id").notNull(),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at"),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
})

export const syncState = sqliteTable("sync_state", {
  tableName: text("table_name").primaryKey(),
  lastSyncAt: integer("last_sync_at").notNull().default(0),
  lastSyncedRowTimestamp: integer("last_synced_row_timestamp"),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/schema.ts app/test/db/schema.test.ts
git commit -m "feat(db): drizzle schema for mirrored + sync tables"
```

---

### Task 3: Generate initial migration + DB open/migrate runner + app boot wiring

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/index.ts`
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/migrations/` (generated)
- Modify: `/Users/nishantgupta/Documents/noop/app/app/app.tsx`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/runner.test.ts`:

```typescript
import fs from "fs"
import path from "path"

describe("db runner + generated migrations", () => {
  const root = path.resolve(__dirname, "..", "..")

  it("ships a generated migration journal", () => {
    const journal = path.resolve(root, "app", "services", "db", "migrations", "meta", "_journal.json")
    expect(fs.existsSync(journal)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(journal, "utf8"))
    expect(parsed.entries.length).toBeGreaterThan(0)
  })

  it("db/index.ts exposes openDatabase, runMigrations, wipeDatabase", () => {
    const src = fs.readFileSync(
      path.resolve(root, "app", "services", "db", "index.ts"),
      "utf8",
    )
    expect(src).toContain("export function openDatabase")
    expect(src).toContain("export async function runMigrations")
    expect(src).toContain("export async function wipeDatabase")
    expect(src).toContain("SQLite.openDatabaseSync")
    expect(src).toContain("drizzle(")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/runner.test.ts`
Expected: FAIL — journal file missing and `db/index.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Generate the migration (Drizzle reads `schema.ts` and emits SQL + journal):

```bash
cd /Users/nishantgupta/Documents/noop/app && npx drizzle-kit generate --name init
```

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/index.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle, ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite"
import { migrate } from "drizzle-orm/expo-sqlite/migrator"
import * as schema from "./schema"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrations = require("./migrations/migrations.js")

export type NoopDatabase = ExpoSQLiteDatabase<typeof schema>

let dbInstance: NoopDatabase | null = null
let sqliteInstance: SQLite.SQLiteDatabase | null = null

export function openDatabase(): NoopDatabase {
  if (dbInstance) return dbInstance
  sqliteInstance = SQLite.openDatabaseSync("noop.db")
  sqliteInstance.execSync("PRAGMA journal_mode = WAL;")
  sqliteInstance.execSync("PRAGMA foreign_keys = ON;")
  dbInstance = drizzle(sqliteInstance, { schema })
  return dbInstance
}

export async function runMigrations(): Promise<void> {
  const db = openDatabase()
  await migrate(db, migrations)
}

export async function wipeDatabase(): Promise<void> {
  if (!sqliteInstance) return
  sqliteInstance.closeSync()
  await SQLite.deleteDatabaseAsync("noop.db")
  dbInstance = null
  sqliteInstance = null
}

export { schema }
```

Modify `/Users/nishantgupta/Documents/noop/app/app/app.tsx` to run migrations before rendering navigation:

Add near existing imports:
```typescript
import { runMigrations } from "./services/db"
```

Inside the `App` component add:
```typescript
const [isDbReady, setIsDbReady] = useState(false)

useEffect(() => {
  runMigrations()
    .then(() => setIsDbReady(true))
    .catch((err) => {
      console.error("[db] migration failed", err)
      setIsDbReady(true)
    })
}, [])
```

Extend the early-return guard the file already has to also require `isDbReady`:
```typescript
if (!isNavigationStateRestored || !isI18nInitialized || !isDbReady || (!areFontsLoaded && !fontLoadError)) {
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/runner.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: Jest PASS; tsc prints no errors.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/index.ts app/app/services/db/migrations app/app/app.tsx app/test/db/runner.test.ts
git commit -m "feat(db): open DB and run migrations on app boot"
```

---
