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

## Phase 2 — Uplink for raw sensor records

### Task 4: Session-scoped userId + rawSensorRecords repository

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/session.ts`
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/rawSensorRecord.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/rawSensorRecord.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/rawSensorRecord.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { insertRawSensorRecord, listRawSensorRecordsByDateRange } from "../../app/services/db/repositories/rawSensorRecord"
import { setActiveUserId } from "../../app/services/db/session"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  // Apply schema inline for the test (drizzle-kit migrations not available in jest)
  sqlite.execSync(`CREATE TABLE raw_sensor_records (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    heart_rate REAL NOT NULL DEFAULT 0,
    rr_average_ms REAL, spo2_red REAL, spo2_ir REAL, skin_temp_raw REAL,
    gravity_magnitude REAL, gravity_x REAL, gravity_y REAL, gravity_z REAL,
    resp_rate_raw REAL, skin_contact INTEGER,
    ppg_green REAL, ppg_red_ir REAL, ambient_light REAL,
    led_drive_1 REAL, led_drive_2 REAL, signal_quality REAL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL,
    _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  return { db: drizzle(sqlite, { schema }), sqlite }
}

describe("rawSensorRecord repository", () => {
  beforeEach(() => setActiveUserId("user-abc"))

  it("inserts a local-origin row with mirror columns populated", async () => {
    const { db } = makeDb()
    await insertRawSensorRecord(db, {
      id: "r1",
      timestamp: 1_700_000_000_000,
      heartRate: 62,
      rrAverageMs: null,
      spo2Red: null, spo2IR: null, skinTempRaw: null,
      gravityMagnitude: null, gravityX: null, gravityY: null, gravityZ: null,
      respRateRaw: null, skinContact: 1,
      ppgGreen: null, ppgRedIr: null, ambientLight: null,
      ledDrive1: null, ledDrive2: null, signalQuality: null,
    })
    const rows = await db.select().from(schema.rawSensorRecords)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe("user-abc")
    expect(rows[0]._origin).toBe("local")
    expect(rows[0]._syncedAt).toBeNull()
    expect(rows[0]._localCreatedAt).toBeGreaterThan(0)
  })

  it("queries by timestamp range scoped to active user", async () => {
    const { db } = makeDb()
    await insertRawSensorRecord(db, { id: "a", timestamp: 100, heartRate: 60 } as any)
    await insertRawSensorRecord(db, { id: "b", timestamp: 200, heartRate: 61 } as any)
    await insertRawSensorRecord(db, { id: "c", timestamp: 300, heartRate: 62 } as any)
    const mid = await listRawSensorRecordsByDateRange(db, 150, 250)
    expect(mid.map((r) => r.id)).toEqual(["b"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/rawSensorRecord.test.ts`
Expected: FAIL — `Cannot find module '../../app/services/db/repositories/rawSensorRecord'`.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/session.ts`:

```typescript
// Session-scoped active user id. Wiped and re-set on login / logout.
// Used by every repository write to stamp `userId` on mirrored rows and
// by wipeDatabase() to know whose data to clear.

let activeUserId: string | null = null

export function setActiveUserId(userId: string | null): void {
  activeUserId = userId
}

export function getActiveUserId(): string {
  if (!activeUserId) throw new Error("No active user — call setActiveUserId before DB writes")
  return activeUserId
}

export function peekActiveUserId(): string | null {
  return activeUserId
}
```

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/rawSensorRecord.ts`:

```typescript
import { and, eq, gte, lte, asc } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { rawSensorRecords } from "../schema"
import { getActiveUserId } from "../session"

export interface RawSensorRecordInput {
  id: string
  timestamp: number
  heartRate: number
  rrAverageMs: number | null
  spo2Red: number | null
  spo2IR: number | null
  skinTempRaw: number | null
  gravityMagnitude: number | null
  gravityX: number | null
  gravityY: number | null
  gravityZ: number | null
  respRateRaw: number | null
  skinContact: number | null
  ppgGreen: number | null
  ppgRedIr: number | null
  ambientLight: number | null
  ledDrive1: number | null
  ledDrive2: number | null
  signalQuality: number | null
}

export async function insertRawSensorRecord(
  db: NoopDatabase,
  input: RawSensorRecordInput,
): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(rawSensorRecords).values({
    ...input,
    _syncedAt: null,
    _localCreatedAt: Date.now(),
    _origin: "local",
    userId,
  })
}

export async function listRawSensorRecordsByDateRange(
  db: NoopDatabase,
  fromTs: number,
  toTs: number,
) {
  const userId = getActiveUserId()
  return db
    .select()
    .from(rawSensorRecords)
    .where(
      and(
        eq(rawSensorRecords.userId, userId),
        gte(rawSensorRecords.timestamp, fromTs),
        lte(rawSensorRecords.timestamp, toTs),
      ),
    )
    .orderBy(asc(rawSensorRecords.timestamp))
}

export async function markRawSensorRecordsSynced(
  db: NoopDatabase,
  ids: string[],
  syncedAt: number,
): Promise<void> {
  if (ids.length === 0) return
  for (const id of ids) {
    await db
      .update(rawSensorRecords)
      .set({ _syncedAt: syncedAt })
      .where(eq(rawSensorRecords.id, id))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/rawSensorRecord.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/session.ts app/app/services/db/repositories/rawSensorRecord.ts app/test/db/rawSensorRecord.test.ts
git commit -m "feat(db): rawSensorRecord repo + session userId tagging"
```

---

### Task 5: outboundQueue repository

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/outboundQueue.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/outboundQueue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/outboundQueue.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import {
  enqueueOutbound,
  claimOutboundBatch,
  markOutboundSynced,
  recordOutboundFailure,
  listDeadLetters,
} from "../../app/services/db/repositories/outboundQueue"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE outbound_queue (
    id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
    payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("outboundQueue", () => {
  it("enqueues and claims in FIFO order", async () => {
    const db = makeDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "b", payload: { id: "b" } })
    const batch = await claimOutboundBatch(db, 10)
    expect(batch.map((r) => r.rowId)).toEqual(["a", "b"])
  })

  it("markOutboundSynced removes rows", async () => {
    const db = makeDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    const [row] = await claimOutboundBatch(db, 10)
    await markOutboundSynced(db, [row.id])
    const next = await claimOutboundBatch(db, 10)
    expect(next).toHaveLength(0)
  })

  it("recordOutboundFailure increments attempts + preserves payload", async () => {
    const db = makeDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    const [row] = await claimOutboundBatch(db, 10)
    await recordOutboundFailure(db, row.id, "network timeout")
    const retry = (await claimOutboundBatch(db, 10))[0]
    expect(retry.attempts).toBe(1)
    expect(retry.lastError).toBe("network timeout")
  })

  it("listDeadLetters returns rows with attempts >= 10", async () => {
    const db = makeDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "dead", payload: {} })
    const [row] = await claimOutboundBatch(db, 10)
    for (let i = 0; i < 10; i++) await recordOutboundFailure(db, row.id, "err")
    const dead = await listDeadLetters(db)
    expect(dead).toHaveLength(1)
    expect(dead[0].rowId).toBe("dead")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/outboundQueue.test.ts`
Expected: FAIL — `Cannot find module '../../app/services/db/repositories/outboundQueue'`.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/outboundQueue.ts`:

```typescript
import { and, asc, eq, gte, sql } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { outboundQueue } from "../schema"

// Dead-letter threshold: row moves out of active drain once attempts >= this.
export const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 10

export interface EnqueueInput {
  tableName: string
  rowId: string
  payload: unknown
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function enqueueOutbound(db: NoopDatabase, input: EnqueueInput): Promise<void> {
  await db.insert(outboundQueue).values({
    id: newId(),
    tableName: input.tableName,
    rowId: input.rowId,
    payload: JSON.stringify(input.payload),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: Date.now(),
  })
}

export async function claimOutboundBatch(db: NoopDatabase, limit: number) {
  // Skip dead-letters (attempts >= threshold); drain FIFO otherwise.
  const rows = await db
    .select()
    .from(outboundQueue)
    .where(sql`attempts < ${MAX_ATTEMPTS_BEFORE_DEAD_LETTER}`)
    .orderBy(asc(outboundQueue.createdAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as unknown }))
}

export async function markOutboundSynced(db: NoopDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  for (const id of ids) {
    await db.delete(outboundQueue).where(eq(outboundQueue.id, id))
  }
}

export async function recordOutboundFailure(
  db: NoopDatabase,
  id: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(outboundQueue)
    .set({
      attempts: sql`${outboundQueue.attempts} + 1`,
      lastAttemptAt: Date.now(),
      lastError: errorMessage,
    })
    .where(eq(outboundQueue.id, id))
}

export async function listDeadLetters(db: NoopDatabase) {
  return db
    .select()
    .from(outboundQueue)
    .where(gte(outboundQueue.attempts, MAX_ATTEMPTS_BEFORE_DEAD_LETTER))
}

export async function queueDepth(db: NoopDatabase): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)` }).from(outboundQueue)
  return rows[0]?.c ?? 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/outboundQueue.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/repositories/outboundQueue.ts app/test/db/outboundQueue.test.ts
git commit -m "feat(db): outbound queue repository with dead-letter threshold"
```

---

### Task 6: uplinkDrainer — pulls batches, POSTs to backend, marks synced

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/sync/uplinkDrainer.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/sync/uplinkDrainer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/sync/uplinkDrainer.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { enqueueOutbound, queueDepth } from "../../app/services/db/repositories/outboundQueue"
import { drainOnce } from "../../app/services/sync/uplinkDrainer"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE outbound_queue (
    id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
    payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("uplinkDrainer", () => {
  it("drains the queue when POST succeeds", async () => {
    const db = makeDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    const post = jest.fn().mockResolvedValue({ ok: true })
    await drainOnce(db, { post, batchSize: 100 })
    expect(post).toHaveBeenCalledWith("raw_sensor_records", expect.arrayContaining([{ id: "a" }]))
    expect(await queueDepth(db)).toBe(0)
  })

  it("leaves row enqueued on failure and increments attempts", async () => {
    const db = makeDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: {} })
    const post = jest.fn().mockRejectedValue(new Error("network"))
    await drainOnce(db, { post, batchSize: 100 })
    expect(await queueDepth(db)).toBe(1)
  })

  it("groups payloads by tableName and batches per group", async () => {
    const db = makeDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    await enqueueOutbound(db, { tableName: "journal_entries", rowId: "j", payload: { id: "j" } })
    const post = jest.fn().mockResolvedValue({ ok: true })
    await drainOnce(db, { post, batchSize: 100 })
    expect(post).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenCalledWith("raw_sensor_records", [{ id: "a" }])
    expect(post).toHaveBeenCalledWith("journal_entries", [{ id: "j" }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/uplinkDrainer.test.ts`
Expected: FAIL — `Cannot find module '../../app/services/sync/uplinkDrainer'`.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/sync/uplinkDrainer.ts`:

```typescript
import type { NoopDatabase } from "../db"
import {
  claimOutboundBatch,
  markOutboundSynced,
  recordOutboundFailure,
} from "../db/repositories/outboundQueue"

export interface DrainOptions {
  post: (tableName: string, payloads: unknown[]) => Promise<unknown>
  batchSize: number
}

export async function drainOnce(db: NoopDatabase, opts: DrainOptions): Promise<void> {
  const batch = await claimOutboundBatch(db, opts.batchSize)
  if (batch.length === 0) return

  // Group by tableName so each POST is a single-table bulk.
  const groups = new Map<string, typeof batch>()
  for (const row of batch) {
    const list = groups.get(row.tableName) ?? []
    list.push(row)
    groups.set(row.tableName, list)
  }

  for (const [tableName, rows] of groups) {
    const payloads = rows.map((r) => r.payload)
    try {
      await opts.post(tableName, payloads)
      await markOutboundSynced(db, rows.map((r) => r.id))
    } catch (err: any) {
      for (const r of rows) {
        await recordOutboundFailure(db, r.id, err?.message ?? "unknown error")
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/uplinkDrainer.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/app/services/sync/uplinkDrainer.ts app/test/sync/uplinkDrainer.test.ts
git commit -m "feat(sync): uplinkDrainer groups by table and batches POSTs"
```

---

### Task 7: SyncService orchestrator shell + app-state integration

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/sync/SyncService.ts`
- Modify: `/Users/nishantgupta/Documents/noop/app/app/app.tsx`
- Test: `/Users/nishantgupta/Documents/noop/app/test/sync/SyncService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/sync/SyncService.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/SyncService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/sync/SyncService.ts`:

```typescript
export interface SyncServiceOptions {
  drainFn: () => Promise<void>
  pullFn: () => Promise<void>
  intervalMs: number
}

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
    await this.opts.drainFn().catch((err) => console.warn("[sync] drain failed", err))
    await this.opts.pullFn().catch((err) => console.warn("[sync] pull failed", err))
  }
}
```

Modify `/Users/nishantgupta/Documents/noop/app/app/app.tsx`: after DB ready, wire SyncService.

Add near other imports:
```typescript
import { AppState } from "react-native"
import { SyncService } from "./services/sync/SyncService"
import { drainOnce } from "./services/sync/uplinkDrainer"
import { openDatabase } from "./services/db"
import { apiPost } from "./services/api/noopClient"
```

Inside `App()`, after the `isDbReady` effect:

```typescript
useEffect(() => {
  if (!isDbReady) return
  const db = openDatabase()
  const svc = new SyncService({
    drainFn: () =>
      drainOnce(db, {
        post: (tableName, payloads) =>
          apiPost(`/pipeline/ingest-table`, { tableName, rows: payloads }),
        batchSize: 200,
      }),
    pullFn: async () => {
      // Phase 3 will fill this in with downlinkPuller.
    },
    intervalMs: 15_000,
  })
  svc.start()
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") void svc.refresh()
  })
  return () => {
    svc.stop()
    sub.remove()
  }
}, [isDbReady])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/SyncService.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: Jest PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/sync/SyncService.ts app/app/app.tsx app/test/sync/SyncService.test.ts
git commit -m "feat(sync): SyncService orchestrator + app-state refresh"
```

---

### Task 8: Wire BLE ingest path to write-local-first + enqueue

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/services/api/noopClient.ts` (add a backend-ingest endpoint the drainer calls; keep existing `ingestHistoricalRecords` as-is during transition)
- Modify: the BLE ingest call site — find the existing path that calls `ingestHistoricalRecords` / writes to the backend, and change it to write-local-first
- Test: `/Users/nishantgupta/Documents/noop/app/test/sync/bleIngestLocalFirst.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/sync/bleIngestLocalFirst.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { ingestBleRecord } from "../../app/services/sync/bleIngest"
import { setActiveUserId } from "../../app/services/db/session"
import { queueDepth } from "../../app/services/db/repositories/outboundQueue"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE raw_sensor_records (
    id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL,
    heart_rate REAL NOT NULL DEFAULT 0,
    rr_average_ms REAL, spo2_red REAL, spo2_ir REAL, skin_temp_raw REAL,
    gravity_magnitude REAL, gravity_x REAL, gravity_y REAL, gravity_z REAL,
    resp_rate_raw REAL, skin_contact INTEGER,
    ppg_green REAL, ppg_red_ir REAL, ambient_light REAL,
    led_drive_1 REAL, led_drive_2 REAL, signal_quality REAL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL,
    _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  sqlite.execSync(`CREATE TABLE outbound_queue (
    id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
    payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("bleIngest (write-local-first)", () => {
  beforeEach(() => setActiveUserId("u"))

  it("writes a raw row + enqueues an uplink payload in one call", async () => {
    const db = makeDb()
    await ingestBleRecord(db, {
      id: "r1",
      timestamp: 1_700_000_000_000,
      heartRate: 60,
      rrAverageMs: null,
      spo2Red: null, spo2IR: null, skinTempRaw: null,
      gravityMagnitude: null, gravityX: null, gravityY: null, gravityZ: null,
      respRateRaw: null, skinContact: 1,
      ppgGreen: null, ppgRedIr: null, ambientLight: null,
      ledDrive1: null, ledDrive2: null, signalQuality: null,
    })
    const raws = await db.select().from(schema.rawSensorRecords)
    expect(raws).toHaveLength(1)
    expect(await queueDepth(db)).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/bleIngestLocalFirst.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/sync/bleIngest.ts`:

```typescript
import type { NoopDatabase } from "../db"
import {
  insertRawSensorRecord,
  RawSensorRecordInput,
} from "../db/repositories/rawSensorRecord"
import { enqueueOutbound } from "../db/repositories/outboundQueue"

export async function ingestBleRecord(
  db: NoopDatabase,
  record: RawSensorRecordInput,
): Promise<void> {
  await insertRawSensorRecord(db, record)
  await enqueueOutbound(db, {
    tableName: "raw_sensor_records",
    rowId: record.id,
    payload: record,
  })
}
```

Find the existing BLE ingest call site. In the current repo this is wherever the app decodes a `HistoricalRecord` and calls `ingestHistoricalRecords` from `noopClient`. Replace that direct call with `ingestBleRecord(openDatabase(), mapped)` where `mapped` shapes the record to `RawSensorRecordInput`. The `ingestHistoricalRecords` HTTP call is now made only by the uplink drainer — leave the function in `noopClient.ts` so the drainer can still call it, but remove its direct callers.

Search for call sites:
```bash
cd /Users/nishantgupta/Documents/noop/app && grep -rn "ingestHistoricalRecords" app/
```
Each hit outside `noopClient.ts` and the drainer should be replaced with the local-first variant.

- [ ] **Step 4: Run test to verify it passes + smoke check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/bleIngestLocalFirst.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS, tsc clean.

Manual simulator check: with the simulator running from your normal `npx expo run:ios` flow, connect a strap, capture a few records, verify the app still renders them and the backend receives them after a ~15s drain cycle. Airplane-mode test: toggle airplane mode, capture more records, toggle off — the drainer should catch up on the next `AppState.active` event.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/sync/bleIngest.ts app/app/services/ble app/test/sync/bleIngestLocalFirst.test.ts
git commit -m "feat(sync): BLE ingest now writes local-first + enqueues uplink"
```

---

## Phase 3 — Downlink for derived tables + view cache

### Task 9: syncState repository (per-table lastSyncAt cursor)

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/syncState.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/syncState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/syncState.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { getLastSyncAt, setLastSyncAt } from "../../app/services/db/repositories/syncState"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE sync_state (
    table_name TEXT PRIMARY KEY, last_sync_at INTEGER NOT NULL DEFAULT 0,
    last_synced_row_timestamp INTEGER
  );`)
  return drizzle(sqlite, { schema })
}

describe("syncState", () => {
  it("returns 0 when no row yet", async () => {
    const db = makeDb()
    expect(await getLastSyncAt(db, "daily_metrics")).toBe(0)
  })

  it("upserts and retrieves lastSyncAt per table", async () => {
    const db = makeDb()
    await setLastSyncAt(db, "daily_metrics", 1000)
    await setLastSyncAt(db, "sleep_stages", 2000)
    expect(await getLastSyncAt(db, "daily_metrics")).toBe(1000)
    expect(await getLastSyncAt(db, "sleep_stages")).toBe(2000)
    await setLastSyncAt(db, "daily_metrics", 1500)
    expect(await getLastSyncAt(db, "daily_metrics")).toBe(1500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/syncState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/syncState.ts`:

```typescript
import { eq } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { syncState } from "../schema"

export async function getLastSyncAt(db: NoopDatabase, tableName: string): Promise<number> {
  const [row] = await db.select().from(syncState).where(eq(syncState.tableName, tableName))
  return row?.lastSyncAt ?? 0
}

export async function setLastSyncAt(
  db: NoopDatabase,
  tableName: string,
  lastSyncAt: number,
  lastSyncedRowTimestamp?: number,
): Promise<void> {
  await db
    .insert(syncState)
    .values({ tableName, lastSyncAt, lastSyncedRowTimestamp: lastSyncedRowTimestamp ?? null })
    .onConflictDoUpdate({
      target: syncState.tableName,
      set: { lastSyncAt, lastSyncedRowTimestamp: lastSyncedRowTimestamp ?? null },
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/syncState.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/repositories/syncState.ts app/test/db/syncState.test.ts
git commit -m "feat(db): syncState cursor repository"
```

---

### Task 10: Derived table repositories (one file exporting upserts for every downlink entity)

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/derived.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/derived.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/derived.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { upsertDailyMetrics, listDailyMetricsByRange } from "../../app/services/db/repositories/derived"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE daily_metrics (
    id TEXT PRIMARY KEY, day_date INTEGER NOT NULL,
    stress_average REAL, spo2_average REAL, skin_temp_avg_celsius REAL, skin_temp_delta_celsius REAL,
    strain_score REAL, sleep_consistency_score REAL, detected_sleep_nights INTEGER NOT NULL DEFAULT 0,
    lf_hf_ratio_average REAL, recovery_index REAL, training_load_ratio REAL,
    training_load_risk_zone TEXT, spo2_dip_count INTEGER, odi_per_hour REAL, lowest_spo2 REAL,
    core_temperature_estimate REAL, circadian_nadir INTEGER, sleep_architecture_score REAL,
    active_minutes REAL, activity_count INTEGER, updated_at INTEGER NOT NULL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL, _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("derived repositories — daily_metrics", () => {
  beforeEach(() => setActiveUserId("u1"))

  it("upsert with same id overwrites + marks _origin='backend'", async () => {
    const db = makeDb()
    await upsertDailyMetrics(db, [
      { id: "m1", dayDate: 20260101, strainScore: 5, updatedAt: 1000 } as any,
    ])
    await upsertDailyMetrics(db, [
      { id: "m1", dayDate: 20260101, strainScore: 7, updatedAt: 2000 } as any,
    ])
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows).toHaveLength(1)
    expect(rows[0].strainScore).toBe(7)
    expect(rows[0]._origin).toBe("backend")
  })

  it("conflict policy: backend row overwrites a local row with same id", async () => {
    const db = makeDb()
    // Simulate a local-origin row (edge case — daily_metrics wouldn't normally be local,
    // but we test the policy uniformly).
    const sqlite = (db as any)._session.sqliteDB as SQLite.SQLiteDatabase
    sqlite.execSync(
      `INSERT INTO daily_metrics (id, day_date, detected_sleep_nights, updated_at, _local_created_at, _origin, user_id) VALUES ('m1', 20260101, 0, 500, 500, 'local', 'u1');`,
    )
    await upsertDailyMetrics(db, [
      { id: "m1", dayDate: 20260101, strainScore: 9, updatedAt: 3000 } as any,
    ])
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows[0]._origin).toBe("backend")
    expect(rows[0].strainScore).toBe(9)
  })

  it("listDailyMetricsByRange filters by userId and dayDate inclusive", async () => {
    const db = makeDb()
    await upsertDailyMetrics(db, [
      { id: "a", dayDate: 20260101, updatedAt: 1 } as any,
      { id: "b", dayDate: 20260102, updatedAt: 2 } as any,
      { id: "c", dayDate: 20260103, updatedAt: 3 } as any,
    ])
    const mid = await listDailyMetricsByRange(db, 20260102, 20260103)
    expect(mid.map((r) => r.id).sort()).toEqual(["b", "c"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/derived.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/derived.ts`:

```typescript
import { and, asc, eq, gte, lte } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import {
  dailyMetrics,
  dailyScores,
  sleepDetections,
  sleepStages,
  nightFeatures,
  signalSamples,
  activityDetections,
  baselineProfile,
  sleepPlans,
} from "../schema"
import { getActiveUserId } from "../session"

function backendMirror() {
  return { _syncedAt: Date.now(), _localCreatedAt: Date.now(), _origin: "backend" as const }
}

async function upsertMany<T extends { id: string }>(
  db: NoopDatabase,
  table: any,
  rows: T[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = getActiveUserId()
  const mirror = backendMirror()
  for (const row of rows) {
    await db
      .insert(table)
      .values({ ...row, userId, ...mirror })
      .onConflictDoUpdate({
        target: table.id,
        set: { ...row, ...mirror, _origin: "backend" },
      })
  }
}

export const upsertDailyMetrics = (db: NoopDatabase, rows: any[]) => upsertMany(db, dailyMetrics, rows)
export const upsertDailyScores = (db: NoopDatabase, rows: any[]) => upsertMany(db, dailyScores, rows)
export const upsertSleepDetections = (db: NoopDatabase, rows: any[]) => upsertMany(db, sleepDetections, rows)
export const upsertSleepStages = (db: NoopDatabase, rows: any[]) => upsertMany(db, sleepStages, rows)
export const upsertNightFeatures = (db: NoopDatabase, rows: any[]) => upsertMany(db, nightFeatures, rows)
export const upsertSignalSamples = (db: NoopDatabase, rows: any[]) => upsertMany(db, signalSamples, rows)
export const upsertActivityDetections = (db: NoopDatabase, rows: any[]) => upsertMany(db, activityDetections, rows)
export const upsertBaselineProfile = (db: NoopDatabase, rows: any[]) => upsertMany(db, baselineProfile, rows)
export const upsertSleepPlans = (db: NoopDatabase, rows: any[]) => upsertMany(db, sleepPlans, rows)

export async function listDailyMetricsByRange(
  db: NoopDatabase,
  fromDayDate: number,
  toDayDate: number,
) {
  const userId = getActiveUserId()
  return db
    .select()
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.userId, userId),
        gte(dailyMetrics.dayDate, fromDayDate),
        lte(dailyMetrics.dayDate, toDayDate),
      ),
    )
    .orderBy(asc(dailyMetrics.dayDate))
}

export async function listSleepDetectionByNight(db: NoopDatabase, nightDate: number) {
  const userId = getActiveUserId()
  const rows = await db
    .select()
    .from(sleepDetections)
    .where(and(eq(sleepDetections.userId, userId), eq(sleepDetections.nightDate, nightDate)))
  return rows[0] ?? null
}

export async function listSleepStagesByNight(db: NoopDatabase, nightDate: number) {
  const userId = getActiveUserId()
  const rows = await db
    .select()
    .from(sleepStages)
    .where(and(eq(sleepStages.userId, userId), eq(sleepStages.nightDate, nightDate)))
  return rows[0] ?? null
}

export async function getBaselineProfile(db: NoopDatabase) {
  const userId = getActiveUserId()
  const rows = await db.select().from(baselineProfile).where(eq(baselineProfile.userId, userId))
  return rows[0] ?? null
}

export async function getSleepPlan(db: NoopDatabase) {
  const userId = getActiveUserId()
  const rows = await db.select().from(sleepPlans).where(eq(sleepPlans.userId, userId))
  return rows[0] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/derived.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/repositories/derived.ts app/test/db/derived.test.ts
git commit -m "feat(db): derived-table upsert repositories with backend-wins policy"
```

---

### Task 11: viewCache repository

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/viewCache.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/viewCache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/viewCache.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { getViewCache, setViewCache } from "../../app/services/db/repositories/viewCache"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE view_cache (
    view_name TEXT NOT NULL, date TEXT NOT NULL, payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL, user_id TEXT NOT NULL,
    PRIMARY KEY (view_name, date, user_id)
  );`)
  return drizzle(sqlite, { schema })
}

describe("viewCache", () => {
  beforeEach(() => setActiveUserId("u"))

  it("upserts and reads a view payload", async () => {
    const db = makeDb()
    await setViewCache(db, "home", "2026-04-18", { rings: { sleep: { value: "7h" } } })
    const payload = await getViewCache<any>(db, "home", "2026-04-18")
    expect(payload.rings.sleep.value).toBe("7h")
  })

  it("returns null when no cache row", async () => {
    const db = makeDb()
    expect(await getViewCache(db, "home", "2026-04-18")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/viewCache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/viewCache.ts`:

```typescript
import { and, eq } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { viewCache } from "../schema"
import { getActiveUserId } from "../session"

export async function setViewCache(
  db: NoopDatabase,
  viewName: string,
  date: string,
  payload: unknown,
): Promise<void> {
  const userId = getActiveUserId()
  await db
    .insert(viewCache)
    .values({ viewName, date, userId, payload: JSON.stringify(payload), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: [viewCache.viewName, viewCache.date, viewCache.userId],
      set: { payload: JSON.stringify(payload), updatedAt: Date.now() },
    })
}

export async function getViewCache<T>(
  db: NoopDatabase,
  viewName: string,
  date: string,
): Promise<T | null> {
  const userId = getActiveUserId()
  const [row] = await db
    .select()
    .from(viewCache)
    .where(
      and(
        eq(viewCache.viewName, viewName),
        eq(viewCache.date, date),
        eq(viewCache.userId, userId),
      ),
    )
  if (!row) return null
  return JSON.parse(row.payload) as T
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/viewCache.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/repositories/viewCache.ts app/test/db/viewCache.test.ts
git commit -m "feat(db): viewCache repo for HomeView/SleepView/TrendsView JSON"
```

---

### Task 12: downlinkPuller + conflict policy test

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/sync/downlinkPuller.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/sync/downlinkPuller.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/sync/downlinkPuller.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { pullDownlink } from "../../app/services/sync/downlinkPuller"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE daily_metrics (
    id TEXT PRIMARY KEY, day_date INTEGER NOT NULL, stress_average REAL, spo2_average REAL,
    skin_temp_avg_celsius REAL, skin_temp_delta_celsius REAL, strain_score REAL,
    sleep_consistency_score REAL, detected_sleep_nights INTEGER NOT NULL DEFAULT 0,
    lf_hf_ratio_average REAL, recovery_index REAL, training_load_ratio REAL,
    training_load_risk_zone TEXT, spo2_dip_count INTEGER, odi_per_hour REAL, lowest_spo2 REAL,
    core_temperature_estimate REAL, circadian_nadir INTEGER, sleep_architecture_score REAL,
    active_minutes REAL, activity_count INTEGER, updated_at INTEGER NOT NULL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL, _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  sqlite.execSync(`CREATE TABLE sync_state (
    table_name TEXT PRIMARY KEY, last_sync_at INTEGER NOT NULL DEFAULT 0,
    last_synced_row_timestamp INTEGER
  );`)
  sqlite.execSync(`CREATE TABLE outbound_queue (
    id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
    payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("downlinkPuller", () => {
  beforeEach(() => setActiveUserId("u"))

  it("fetches derived rows and upserts them; advances sync cursor", async () => {
    const db = makeDb()
    const apiGet = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "m1", dayDate: 20260101, updatedAt: 1500 }], hasMore: false })
      .mockResolvedValue({ rows: [], hasMore: false })
    await pullDownlink(db, { apiGet, tables: ["daily_metrics"] })
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows).toHaveLength(1)
    expect(rows[0]._origin).toBe("backend")
  })

  it("conflict policy: backend version wins over local version with same id", async () => {
    const db = makeDb()
    const sqlite = (db as any)._session.sqliteDB as SQLite.SQLiteDatabase
    sqlite.execSync(
      `INSERT INTO daily_metrics (id, day_date, detected_sleep_nights, updated_at, _local_created_at, _origin, user_id, strain_score) VALUES ('m1', 20260101, 0, 500, 500, 'local', 'u', 1);`,
    )
    const apiGet = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "m1", dayDate: 20260101, updatedAt: 2000, strainScore: 9 }], hasMore: false })
      .mockResolvedValue({ rows: [], hasMore: false })
    await pullDownlink(db, { apiGet, tables: ["daily_metrics"] })
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows[0]._origin).toBe("backend")
    expect(rows[0].strainScore).toBe(9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/downlinkPuller.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/sync/downlinkPuller.ts`:

```typescript
import type { NoopDatabase } from "../db"
import { getLastSyncAt, setLastSyncAt } from "../db/repositories/syncState"
import {
  upsertDailyMetrics,
  upsertDailyScores,
  upsertSleepDetections,
  upsertSleepStages,
  upsertNightFeatures,
  upsertSignalSamples,
  upsertActivityDetections,
  upsertBaselineProfile,
  upsertSleepPlans,
} from "../db/repositories/derived"

type Upserter = (db: NoopDatabase, rows: any[]) => Promise<void>

const UPSERTERS: Record<string, Upserter> = {
  daily_metrics: upsertDailyMetrics,
  daily_scores: upsertDailyScores,
  sleep_detections: upsertSleepDetections,
  sleep_stages: upsertSleepStages,
  night_features: upsertNightFeatures,
  signal_samples: upsertSignalSamples,
  activity_detections: upsertActivityDetections,
  baseline_profile: upsertBaselineProfile,
  sleep_plans: upsertSleepPlans,
}

export interface PullOptions {
  apiGet: (path: string) => Promise<{ rows: any[]; hasMore: boolean }>
  tables: string[]
  pageSize?: number
}

export async function pullDownlink(db: NoopDatabase, opts: PullOptions): Promise<void> {
  const pageSize = opts.pageSize ?? 1000
  for (const tableName of opts.tables) {
    const upserter = UPSERTERS[tableName]
    if (!upserter) continue
    let since = await getLastSyncAt(db, tableName)
    for (;;) {
      const path = `/sync/${tableName}?since=${since}&limit=${pageSize}`
      const { rows, hasMore } = await opts.apiGet(path)
      if (rows.length === 0) break
      await upserter(db, rows)
      const maxUpdatedAt = Math.max(...rows.map((r: any) => r.updatedAt ?? since))
      since = maxUpdatedAt
      await setLastSyncAt(db, tableName, since)
      if (!hasMore) break
    }
  }
}
```

Also wire this into `SyncService` in `/Users/nishantgupta/Documents/noop/app/app/app.tsx` — replace the Phase-2 empty `pullFn` with a real one:

```typescript
pullFn: () =>
  pullDownlink(db, {
    apiGet,
    tables: [
      "daily_metrics",
      "daily_scores",
      "sleep_detections",
      "sleep_stages",
      "night_features",
      "signal_samples",
      "activity_detections",
      "baseline_profile",
      "sleep_plans",
    ],
  }),
```

with imports:
```typescript
import { pullDownlink } from "./services/sync/downlinkPuller"
import { apiGet } from "./services/api/noopClient"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/downlinkPuller.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: Jest PASS (2 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/sync/downlinkPuller.ts app/app/app.tsx app/test/sync/downlinkPuller.test.ts
git commit -m "feat(sync): downlinkPuller with backend-wins conflict policy"
```

---

### Task 13: useDbQuery hook + repository observe() wrapper

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/observable.ts`
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/useDbQuery.ts`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/observable.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/observable.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/observable.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/observable.ts`:

```typescript
type Subscriber = () => void

const subscribers = new Map<string, Set<Subscriber>>()

export function createObservable(tableName: string, subscriber: Subscriber): () => void {
  if (!subscribers.has(tableName)) subscribers.set(tableName, new Set())
  subscribers.get(tableName)!.add(subscriber)
  return () => subscribers.get(tableName)?.delete(subscriber)
}

export function notifyTable(tableName: string): void {
  const set = subscribers.get(tableName)
  if (!set) return
  for (const sub of set) sub()
}
```

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/useDbQuery.ts`:

```typescript
import { useEffect, useState, useRef } from "react"
import { createObservable } from "./observable"

export function useDbQuery<T>(
  tableDeps: string[],
  queryFn: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): { data: T | null; isLoading: boolean; error: Error | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const tick = useRef(0)

  const refetch = () => {
    const myTick = ++tick.current
    setLoading(true)
    queryFn()
      .then((value) => {
        if (myTick !== tick.current) return
        setData(value)
        setError(null)
      })
      .catch((err) => {
        if (myTick !== tick.current) return
        setError(err)
      })
      .finally(() => {
        if (myTick !== tick.current) return
        setLoading(false)
      })
  }

  useEffect(() => {
    refetch()
    const unsubs = tableDeps.map((name) => createObservable(name, refetch))
    return () => { for (const u of unsubs) u() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, isLoading, error, refetch }
}
```

Update the repository inserts/upserts from Tasks 4, 5, 10, 11 to call `notifyTable(tableName)` after writes. For example, in `rawSensorRecord.ts` append:
```typescript
import { notifyTable } from "../observable"
// ...at end of insertRawSensorRecord:
notifyTable("raw_sensor_records")
```
Repeat in every repo write function (insert/upsert/markSynced) — notify the matching table name. This is straightforward: each write → one `notifyTable(...)` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/observable.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: Jest PASS (2 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/observable.ts app/app/services/db/useDbQuery.ts app/app/services/db/repositories app/test/db/observable.test.ts
git commit -m "feat(db): observable + useDbQuery hook; repositories notify on writes"
```

---

### Task 14: HomeScreen reads from viewCache (not backend directly)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/HomeScreen.tsx`

- [ ] **Step 1: Verify current fetch path**

Run: `cd /Users/nishantgupta/Documents/noop/app && grep -n "fetchHomeView" app/screens/HomeScreen.tsx`
Expected: shows the current direct call to `fetchHomeView` from `noopClient`. Note the line number.

- [ ] **Step 2: Type check baseline**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS (baseline before edits)

- [ ] **Step 3: Apply the edit**

In `HomeScreen.tsx`, replace the direct `fetchHomeView(date)` call with a local-DB read + background refresh pattern:

```typescript
// Remove: import { fetchHomeView } from "../services/api/noopClient"
import { openDatabase } from "../services/db"
import { getViewCache } from "../services/db/repositories/viewCache"
import { useDbQuery } from "../services/db/useDbQuery"

// inside the component:
const db = openDatabase()
const { data: home, isLoading, refetch } = useDbQuery(
  ["view_cache"],
  () => getViewCache<HomeViewModel>(db, "home", selectedDate),
  [selectedDate],
)
```

The `SyncService` already refreshes `view_cache` on foreground + pull-to-refresh. Wire the existing pull-to-refresh gesture to call both `SyncService.refresh()` and `refetch()`. Where the screen currently passes the fetched view to its children, pass `home` instead; tolerate `home === null` by showing the existing empty state.

For the view_cache to actually contain the home view JSON, extend `downlinkPuller` to fetch `GET /views/home?date=<date>` for the currently-shown date. Add to `Phase 3 downlinkPuller` call site in `app.tsx`:

```typescript
// After pullDownlink for entities, also refresh cached views for the active date.
const today = new Date().toISOString().slice(0, 10)
const home = await apiGet(`/views/home?date=${today}`)
await setViewCache(db, "home", today, home)
```

This lives alongside the existing `pullDownlink` call.

- [ ] **Step 4: Type check + simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

Simulator: open the Home tab. Verify rings render with the same values as before (when online). Toggle airplane mode, kill the app, reopen — Home should still render from `view_cache`. No "network error" banner. Pull-to-refresh should bump the updatedAt timestamp in the `view_cache` table (`sqlite3` inspector or Debug screen in Phase 4's retention task).

- [ ] **Step 5: Commit**

```bash
git add app/app/screens/HomeScreen.tsx app/app/app.tsx
git commit -m "feat(screens): HomeScreen reads from view_cache with background refresh"
```

---

### Task 15: SleepDetailScreen + TrendsScreen read from viewCache

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/SleepDetailScreen.tsx`
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/TrendsScreen.tsx`
- Modify: `/Users/nishantgupta/Documents/noop/app/app/app.tsx` (extend viewCache prefetch in Phase 3's SyncService wiring)

- [ ] **Step 1: Verify current fetch path**

Run:
```bash
cd /Users/nishantgupta/Documents/noop/app && grep -n "fetchSleepView\|fetchTrendsView" app/screens/SleepDetailScreen.tsx app/screens/TrendsScreen.tsx
```
Expected: each screen has a direct `fetchSleepView` / `fetchTrendsView` call that needs replacing.

- [ ] **Step 2: Type check baseline**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Apply the edits**

`SleepDetailScreen.tsx` — replace fetch call:

```typescript
import { openDatabase } from "../services/db"
import { getViewCache } from "../services/db/repositories/viewCache"
import { useDbQuery } from "../services/db/useDbQuery"

const db = openDatabase()
const { data: sleep, refetch } = useDbQuery(
  ["view_cache"],
  () => getViewCache<SleepViewModel>(db, "sleep", selectedDate),
  [selectedDate],
)
```

`TrendsScreen.tsx`:

```typescript
const db = openDatabase()
const { data: trends, refetch } = useDbQuery(
  ["view_cache"],
  () => getViewCache<TrendsViewModel>(db, "trends", `${days}d`),
  [days],
)
```

Extend the view-cache prefetch in `app.tsx` from Task 14 to also prefetch sleep and trends on refresh:

```typescript
const today = new Date().toISOString().slice(0, 10)
const [home, sleep, trends] = await Promise.all([
  apiGet(`/views/home?date=${today}`),
  apiGet(`/views/sleep?date=${today}`),
  apiGet(`/views/trends?days=30`),
])
await setViewCache(db, "home", today, home)
await setViewCache(db, "sleep", today, sleep)
await setViewCache(db, "trends", "30d", trends)
```

- [ ] **Step 4: Type check + simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

Simulator: open Sleep tab, verify everything renders. Open Trends tab, verify the same. Airplane mode + app restart: both should render the cached data.

- [ ] **Step 5: Commit**

```bash
git add app/app/screens/SleepDetailScreen.tsx app/app/screens/TrendsScreen.tsx app/app/app.tsx
git commit -m "feat(screens): Sleep + Trends read from view_cache"
```

---

## Phase 4 — Remaining uplink tables

### Task 16: Journal entry uplink

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/journalEntry.ts`
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/JournalEntryScreen.tsx`
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/JournalHistoryScreen.tsx`
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/journalEntry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/journalEntry.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { insertJournalEntry, listJournalEntriesByDate, deleteJournalEntry } from "../../app/services/db/repositories/journalEntry"
import { queueDepth } from "../../app/services/db/repositories/outboundQueue"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, factor_tag TEXT NOT NULL,
    intensity INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL, _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  sqlite.execSync(`CREATE TABLE outbound_queue (
    id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
    payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("journalEntry repository", () => {
  beforeEach(() => setActiveUserId("u"))

  it("insert writes local row + enqueues uplink", async () => {
    const db = makeDb()
    await insertJournalEntry(db, {
      id: "j1", timestamp: 1000, factorTag: "caffeine", intensity: 3, note: "", createdAt: 1000,
    })
    expect(await queueDepth(db)).toBe(1)
  })

  it("list returns entries for a given date scoped to active user", async () => {
    const db = makeDb()
    const d = new Date("2026-04-18T10:00:00Z").getTime()
    await insertJournalEntry(db, { id: "a", timestamp: d, factorTag: "caffeine", intensity: 3, note: "", createdAt: d })
    const rows = await listJournalEntriesByDate(db, "2026-04-18")
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe("a")
  })

  it("deleteJournalEntry removes + enqueues delete intent", async () => {
    const db = makeDb()
    await insertJournalEntry(db, { id: "a", timestamp: 1000, factorTag: "caffeine", intensity: 3, note: "", createdAt: 1000 })
    await deleteJournalEntry(db, "a")
    const rows = await db.select().from(schema.journalEntries)
    expect(rows).toHaveLength(0)
    expect(await queueDepth(db)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/journalEntry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/journalEntry.ts`:

```typescript
import { and, asc, eq, gte, lt } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { journalEntries } from "../schema"
import { getActiveUserId } from "../session"
import { enqueueOutbound } from "./outboundQueue"
import { notifyTable } from "../observable"

export interface JournalEntryInput {
  id: string
  timestamp: number
  factorTag: string
  intensity: number
  note: string
  createdAt: number
}

export async function insertJournalEntry(db: NoopDatabase, input: JournalEntryInput): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(journalEntries).values({
    ...input,
    _syncedAt: null,
    _localCreatedAt: Date.now(),
    _origin: "local",
    userId,
  })
  await enqueueOutbound(db, { tableName: "journal_entries", rowId: input.id, payload: input })
  notifyTable("journal_entries")
}

export async function listJournalEntriesByDate(db: NoopDatabase, yyyyMmDd: string) {
  const userId = getActiveUserId()
  const start = new Date(`${yyyyMmDd}T00:00:00Z`).getTime()
  const end = start + 24 * 60 * 60 * 1000
  return db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        gte(journalEntries.timestamp, start),
        lt(journalEntries.timestamp, end),
      ),
    )
    .orderBy(asc(journalEntries.timestamp))
}

export async function deleteJournalEntry(db: NoopDatabase, id: string): Promise<void> {
  await db.delete(journalEntries).where(eq(journalEntries.id, id))
  await enqueueOutbound(db, {
    tableName: "journal_entries",
    rowId: id,
    payload: { id, __deleted: true },
  })
  notifyTable("journal_entries")
}
```

In `JournalEntryScreen.tsx`: replace `createJournalEntry` (from `noopClient`) with `insertJournalEntry(openDatabase(), …)`. In `JournalHistoryScreen.tsx`: replace `fetchJournalEntries` with `listJournalEntriesByDate` via `useDbQuery(["journal_entries"], ...)`.

Teach the drainer's `post` to map a deleted payload (`__deleted: true`) to a `DELETE /journal/{id}` request — the backend already supports this. Extend `drainFn` wiring in `app.tsx`:

```typescript
post: async (tableName, payloads) => {
  if (tableName === "journal_entries") {
    for (const p of payloads as any[]) {
      if (p.__deleted) await deleteJournalEntryRemote(p.id)
      else await createJournalEntryRemote(p)
    }
    return { ok: true }
  }
  return apiPost(`/pipeline/ingest-table`, { tableName, rows: payloads })
},
```

Add the remote helpers to `noopClient.ts`:

```typescript
export const deleteJournalEntryRemote = (id: string) => requestJson(`/journal/${encodeURIComponent(id)}`, { method: "DELETE", headers: withBaseHeaders({ Authorization: `Bearer ${sessionToken}` }) })
export const createJournalEntryRemote = (body: any) => apiPost("/journal", body)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/journalEntry.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS; tsc clean.

Simulator smoke: add a journal entry offline (airplane mode). Open JournalHistoryScreen — entry shows immediately. Disable airplane mode — entry eventually syncs, verified by backend-side logs / Debug screen.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/repositories/journalEntry.ts app/app/screens/JournalEntryScreen.tsx app/app/screens/JournalHistoryScreen.tsx app/app/services/api/noopClient.ts app/app/app.tsx app/test/db/journalEntry.test.ts
git commit -m "feat(db): journalEntry local-first with create/delete uplink"
```

---

### Task 17: Telemetry — deviceEvents, realtimeSamples, consoleLogs repositories + wiring

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/telemetry.ts`
- Modify: existing telemetry ingest call sites to write-local-first
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/telemetry.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import {
  insertDeviceEvent,
  insertRealtimeSample,
  insertConsoleLog,
} from "../../app/services/db/repositories/telemetry"
import { queueDepth } from "../../app/services/db/repositories/outboundQueue"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE device_events (
    id TEXT PRIMARY KEY, device_id TEXT NOT NULL, event_number INTEGER NOT NULL, event_name TEXT NOT NULL,
    raw_payload TEXT, captured_at INTEGER NOT NULL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL, _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  sqlite.execSync(`CREATE TABLE realtime_samples (
    id TEXT PRIMARY KEY, device_id TEXT NOT NULL, session_id TEXT NOT NULL, data_type TEXT NOT NULL,
    heart_rate INTEGER, raw_fields TEXT, raw_payload TEXT, captured_at INTEGER NOT NULL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL, _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  sqlite.execSync(`CREATE TABLE console_logs (
    id TEXT PRIMARY KEY, device_id TEXT NOT NULL, message TEXT NOT NULL,
    log_level TEXT, metadata TEXT, captured_at INTEGER NOT NULL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL, _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  sqlite.execSync(`CREATE TABLE outbound_queue (
    id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
    payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER, last_error TEXT, created_at INTEGER NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("telemetry repositories", () => {
  beforeEach(() => setActiveUserId("u"))

  it("each insert enqueues an uplink", async () => {
    const db = makeDb()
    await insertDeviceEvent(db, { id: "e1", deviceId: "d1", eventNumber: 1, eventName: "connect", rawPayload: null, capturedAt: 1000 })
    await insertRealtimeSample(db, { id: "r1", deviceId: "d1", sessionId: "s1", dataType: "hr", heartRate: 62, rawFields: null, rawPayload: null, capturedAt: 1000 })
    await insertConsoleLog(db, { id: "c1", deviceId: "d1", message: "hello", logLevel: "info", metadata: null, capturedAt: 1000 })
    expect(await queueDepth(db)).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/telemetry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/telemetry.ts`:

```typescript
import type { NoopDatabase } from "../index"
import { deviceEvents, realtimeSamples, consoleLogs } from "../schema"
import { getActiveUserId } from "../session"
import { enqueueOutbound } from "./outboundQueue"
import { notifyTable } from "../observable"

function localMirror() {
  return { _syncedAt: null, _localCreatedAt: Date.now(), _origin: "local" as const }
}

export async function insertDeviceEvent(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(deviceEvents).values({ ...row, ...localMirror(), userId })
  await enqueueOutbound(db, { tableName: "device_events", rowId: row.id, payload: row })
  notifyTable("device_events")
}

export async function insertRealtimeSample(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(realtimeSamples).values({ ...row, ...localMirror(), userId })
  await enqueueOutbound(db, { tableName: "realtime_samples", rowId: row.id, payload: row })
  notifyTable("realtime_samples")
}

export async function insertConsoleLog(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(consoleLogs).values({ ...row, ...localMirror(), userId })
  await enqueueOutbound(db, { tableName: "console_logs", rowId: row.id, payload: row })
  notifyTable("console_logs")
}
```

Find existing telemetry ingest call sites:
```bash
cd /Users/nishantgupta/Documents/noop/app && grep -rn "ingestDeviceEvents\|ingestRealtimeSamples\|ingestConsoleLogs\|telemetry/events\|telemetry/realtime" app/
```
Replace each direct `apiPost` call with the corresponding repository insert. The drainer's `post` gains table-specific branches (same pattern as Task 16 journal):

```typescript
if (tableName === "device_events") return apiPost("/telemetry/events", { events: payloads })
if (tableName === "realtime_samples") return apiPost("/telemetry/realtime", { samples: payloads })
if (tableName === "console_logs") return apiPost("/telemetry/logs", { logs: payloads })
```

- [ ] **Step 4: Type check + test**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/telemetry.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/repositories/telemetry.ts app/app/services/api/noopClient.ts app/app/app.tsx app/test/db/telemetry.test.ts
git commit -m "feat(db): telemetry (device_events/realtime/logs) local-first"
```

---

### Task 18: DebugInspectorScreen surfaces sync diagnostics

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/DebugInspectorScreen.tsx`

- [ ] **Step 1: Type check baseline**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Apply the edit**

Add a "Local DB Diagnostics" panel at the top of DebugInspectorScreen showing:
- Per-table row counts (raw_sensor_records, daily_metrics, sleep_stages, journal_entries, outbound_queue, view_cache)
- Outbound queue depth + dead-letter count
- Per-table lastSyncAt timestamp

Implementation:
```typescript
import { openDatabase } from "../services/db"
import * as schema from "../services/db/schema"
import { sql } from "drizzle-orm"
import { listDeadLetters, queueDepth } from "../services/db/repositories/outboundQueue"
import { getLastSyncAt } from "../services/db/repositories/syncState"
import { useDbQuery } from "../services/db/useDbQuery"

const db = openDatabase()

const { data: diagnostics } = useDbQuery(
  ["raw_sensor_records", "daily_metrics", "sleep_stages", "journal_entries", "outbound_queue", "view_cache", "sync_state"],
  async () => {
    const count = async (t: any) =>
      (await db.select({ c: sql<number>`count(*)` }).from(t))[0]?.c ?? 0
    return {
      rawCount: await count(schema.rawSensorRecords),
      dailyMetricsCount: await count(schema.dailyMetrics),
      sleepStagesCount: await count(schema.sleepStages),
      journalCount: await count(schema.journalEntries),
      viewCacheCount: await count(schema.viewCache),
      outboundDepth: await queueDepth(db),
      deadLetters: (await listDeadLetters(db)).length,
      lastSyncDailyMetrics: await getLastSyncAt(db, "daily_metrics"),
      lastSyncSleepStages: await getLastSyncAt(db, "sleep_stages"),
    }
  },
  [],
)
```

Render as a simple key/value table at the top of the screen (matches the existing Debug styling).

- [ ] **Step 3: Simulator smoke**

Open Debug tab. Verify all counts render. Let the app run for a minute while ingesting BLE data — counts should tick up. Toggle airplane mode and observe outbound queue depth growing; toggle off and observe it draining.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/DebugInspectorScreen.tsx
git commit -m "feat(debug): local DB diagnostics panel"
```

---

### Task 19: Logout wipes the database

**Files:**
- Modify: wherever `logout()` is called / defined in the app (likely `app/context/AuthContext` or `app/services/auth`)
- Test: `/Users/nishantgupta/Documents/noop/app/test/db/wipe.test.ts`

- [ ] **Step 1: Find the logout path**

Run: `cd /Users/nishantgupta/Documents/noop/app && grep -rn "logout\|sessionToken" app/context app/services/auth app/services/api 2>/dev/null | head -20`
Note the function that clears the session token today.

- [ ] **Step 2: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/db/wipe.test.ts`:

```typescript
import { wipeDatabaseForLogout } from "../../app/services/db/wipe"
import * as dbModule from "../../app/services/db"
import { setActiveUserId, peekActiveUserId } from "../../app/services/db/session"

jest.mock("../../app/services/db", () => ({ wipeDatabase: jest.fn() }))

describe("wipeDatabaseForLogout", () => {
  it("calls wipeDatabase and clears active user", async () => {
    setActiveUserId("u")
    await wipeDatabaseForLogout()
    expect(dbModule.wipeDatabase).toHaveBeenCalled()
    expect(peekActiveUserId()).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/wipe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/wipe.ts`:

```typescript
import { wipeDatabase } from "./index"
import { setActiveUserId } from "./session"

export async function wipeDatabaseForLogout(): Promise<void> {
  await wipeDatabase()
  setActiveUserId(null)
}
```

Modify the existing logout function to call `wipeDatabaseForLogout()` before clearing the session token. Modify login to call `setActiveUserId(userId)` after a successful sign-in (the backend returns the user's id in the auth response).

- [ ] **Step 5: Run test + simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/db/wipe.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS; tsc clean.

Simulator: log in, let it accumulate some data, log out. Log back in. Verify no old data leaks (Debug screen counts should be zero after logout → login).

- [ ] **Step 6: Commit**

```bash
git add app/app/services/db/wipe.ts app/context app/services/auth app/services/api/noopClient.ts app/test/db/wipe.test.ts
git commit -m "feat(auth): wipe local DB on logout; tag userId on login"
```

---

## Phase 5 — Retention

### Task 20: retentionSweeper + user-configurable setting

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/sync/retentionSweeper.ts`
- Create: `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/settings.ts`
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/DeviceSettingsScreen.tsx` — add "Keep history for" picker
- Modify: `/Users/nishantgupta/Documents/noop/app/app/app.tsx` — run sweeper on foreground
- Test: `/Users/nishantgupta/Documents/noop/app/test/sync/retentionSweeper.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/nishantgupta/Documents/noop/app/test/sync/retentionSweeper.test.ts`:

```typescript
import * as SQLite from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { sweepRetention } from "../../app/services/sync/retentionSweeper"

function makeDb() {
  const sqlite = SQLite.openDatabaseSync(":memory:")
  sqlite.execSync(`CREATE TABLE raw_sensor_records (
    id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, heart_rate REAL NOT NULL DEFAULT 0,
    rr_average_ms REAL, spo2_red REAL, spo2_ir REAL, skin_temp_raw REAL,
    gravity_magnitude REAL, gravity_x REAL, gravity_y REAL, gravity_z REAL,
    resp_rate_raw REAL, skin_contact INTEGER,
    ppg_green REAL, ppg_red_ir REAL, ambient_light REAL,
    led_drive_1 REAL, led_drive_2 REAL, signal_quality REAL,
    _synced_at INTEGER, _local_created_at INTEGER NOT NULL,
    _origin TEXT NOT NULL, user_id TEXT NOT NULL
  );`)
  return drizzle(sqlite, { schema })
}

describe("retentionSweeper", () => {
  beforeEach(() => setActiveUserId("u"))

  it("deletes synced raw rows older than retention cutoff; preserves pending uplink rows", async () => {
    const db = makeDb()
    const now = Date.now()
    const old = now - 60 * 24 * 60 * 60 * 1000
    const fresh = now - 1 * 24 * 60 * 60 * 1000
    await db.insert(schema.rawSensorRecords).values([
      { id: "old-synced", timestamp: old, _syncedAt: old, _localCreatedAt: old, _origin: "local", userId: "u" } as any,
      { id: "old-pending", timestamp: old, _syncedAt: null, _localCreatedAt: old, _origin: "local", userId: "u" } as any,
      { id: "fresh-synced", timestamp: fresh, _syncedAt: fresh, _localCreatedAt: fresh, _origin: "local", userId: "u" } as any,
    ])
    await sweepRetention(db, { rawDays: 30 })
    const rows = await db.select().from(schema.rawSensorRecords)
    const ids = rows.map((r) => r.id).sort()
    expect(ids).toEqual(["fresh-synced", "old-pending"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/retentionSweeper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/nishantgupta/Documents/noop/app/app/services/db/repositories/settings.ts`:

```typescript
import { eq } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { settings } from "../schema"

export async function getSetting(db: NoopDatabase, key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key))
  return row?.value ?? null
}

export async function setSetting(db: NoopDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

export const SETTING_RAW_RETENTION_DAYS = "raw_retention_days"
export const DEFAULT_RAW_RETENTION_DAYS = 30
```

Create `/Users/nishantgupta/Documents/noop/app/app/services/sync/retentionSweeper.ts`:

```typescript
import { and, eq, isNotNull, lt } from "drizzle-orm"
import type { NoopDatabase } from "../db"
import { rawSensorRecords, realtimeSamples, deviceEvents, consoleLogs } from "../db/schema"
import { getActiveUserId } from "../db/session"

export interface SweepOptions {
  rawDays: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export async function sweepRetention(db: NoopDatabase, opts: SweepOptions): Promise<void> {
  const userId = getActiveUserId()
  const cutoff = Date.now() - opts.rawDays * MS_PER_DAY
  for (const table of [rawSensorRecords, realtimeSamples, deviceEvents, consoleLogs]) {
    await db
      .delete(table)
      .where(
        and(
          eq((table as any).userId, userId),
          isNotNull((table as any)._syncedAt),
          lt((table as any).timestamp ?? (table as any).capturedAt, cutoff),
        ),
      )
  }
}
```

Wire the sweeper to run on foreground after SyncService.refresh(). In `app.tsx` inside the `AppState` listener:

```typescript
import { sweepRetention } from "./services/sync/retentionSweeper"
import { getSetting, SETTING_RAW_RETENTION_DAYS, DEFAULT_RAW_RETENTION_DAYS } from "./services/db/repositories/settings"

// ...
const sub = AppState.addEventListener("change", async (state) => {
  if (state === "active") {
    await svc.refresh()
    const raw = Number(await getSetting(db, SETTING_RAW_RETENTION_DAYS)) || DEFAULT_RAW_RETENTION_DAYS
    if (raw > 0) await sweepRetention(db, { rawDays: raw })
  }
})
```

In `DeviceSettingsScreen.tsx` add a row:

```tsx
<ListItem
  text="Keep raw history for"
  rightText={`${rawDays === 0 ? "forever" : `${rawDays} days`}`}
  onPress={() => /* open a sheet/picker with options: 7, 30, 90, 0 (forever) */}
/>
```

On selection, call `setSetting(openDatabase(), SETTING_RAW_RETENTION_DAYS, String(chosen))`.

- [ ] **Step 4: Run test + simulator**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx jest test/sync/retentionSweeper.test.ts && cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS; tsc clean.

Simulator: change retention to 7 days. Background + foreground the app. In Debug screen, observe raw_sensor_records count drop if there are rows older than 7 days that have been synced.

- [ ] **Step 5: Commit**

```bash
git add app/app/services/db/repositories/settings.ts app/app/services/sync/retentionSweeper.ts app/app/screens/DeviceSettingsScreen.tsx app/app/app.tsx app/test/sync/retentionSweeper.test.ts
git commit -m "feat(retention): user-configurable sweep for synced raw tables"
```

---

## Backend dependency

### Task 21: Document `?since=` endpoint requirement for a separate backend PR

**Files:**
- Create: `/Users/nishantgupta/Documents/noop/docs/superpowers/specs/2026-04-18-backend-since-endpoints.md`

This task does **not** modify backend code — it records the contract the downlinkPuller expects so a separate backend PR can land this ahead of merging the app changes that consume it.

- [ ] **Step 1: Write the contract document**

Create `/Users/nishantgupta/Documents/noop/docs/superpowers/specs/2026-04-18-backend-since-endpoints.md`:

```markdown
# Backend `?since=` Endpoints for SQLite Mirror Downlink

**Dependency of:** `docs/superpowers/specs/2026-04-18-local-sqlite-mirror-design.md`

## Required routes

Add `GET /sync/<table_name>?since=<unix-ms>&limit=<int>` for each downlink table. Response shape:

```json
{
  "rows": [{ ...entity fields..., "updatedAt": 1700000000000 }],
  "hasMore": false
}
```

- Filter: rows where `updatedAt > since` for the requesting user.
- Order: `updatedAt` ascending, secondary `id` ascending.
- Limit: `limit` (default 1000, max 5000).
- `hasMore`: true if more rows exist past the response tail.

## Tables the app pulls

| table_name | backend entity |
|---|---|
| `daily_metrics` | `DailyMetric` |
| `daily_scores` | `DailyScore` |
| `sleep_detections` | `SleepDetection` |
| `sleep_stages` | `SleepStage` |
| `night_features` | `NightFeature` |
| `signal_samples` | `SignalSample` |
| `activity_detections` | `ActivityDetection` |
| `baseline_profile` | `BaselineProfile` |
| `sleep_plans` | `SleepPlan` |

For entities that don't yet have an `updatedAt` column, add one (`@UpdateDateColumn()` from TypeORM) — same migration that ships these endpoints.

## Why not reuse existing list endpoints

Existing endpoints like `/pipeline/results` return everything with no since filter — fetching everything on every foreground is wasteful and doesn't scale past a few weeks of data. The app needs an incremental pull.

## Testing

- E2E test per table: seed 10 rows, call `?since=<timestamp_between_5_and_6>`, assert only rows 6–10 returned.
- Pagination test: seed 50 rows, `limit=20`, assert `hasMore=true` and cursor advances correctly.
- Authorization: 401 when no session, 200 with session; `userId` scoping enforced (no cross-user leakage).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-18-backend-since-endpoints.md
git commit -m "docs: backend ?since= endpoint contract for sqlite mirror"
```

---

## Rollout notes

- Merge order: backend PR (Task 21 contract → backend implementation) → then this app plan. Phases 1–2 and 4–5 of this plan do not depend on the backend PR; only Phase 3 (downlink) does.
- Each phase is independently shippable. Do not start Phase 3 until the backend endpoints are live.
- Regression surface: `expo run:ios` after each task, verify the app still opens, verify Debug screen is reachable.
- Performance: the `outbound_queue` + drain loop has been sized for ~200 rows per 15 s cycle. Adjust `batchSize` in `SyncService` wiring if real-world BLE rate exceeds that.

---

**Total tasks: 21.** Covers every section of the spec. When all tasks are green and committed, the local SQLite mirror is feature-complete per the design doc.



