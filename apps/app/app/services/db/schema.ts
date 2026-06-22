import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core"

// Shared mirror columns:
// _localCreatedAt unix ms when the app first wrote the row
// _origin         "local" (app wrote it) or "backend" (downlink pulled it)
// userId          active user id stamped on every write; wipe-on-logout uses this column

const mirrorColumns = {
  _localCreatedAt: integer("_local_created_at").notNull(),
  _origin: text("_origin", { enum: ["local", "backend"] }).notNull(),
  userId: text("user_id").notNull(),
}

// Uplink (local-origin) tables

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

// Downlink (backend-origin) tables

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

// View-model cache (local-only)

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

// Sync-tracking (local-only)

export const syncState = sqliteTable("sync_state", {
  tableName: text("table_name").primaryKey(),
  lastSyncAt: integer("last_sync_at").notNull().default(0),
  lastSyncedRowTimestamp: integer("last_synced_row_timestamp"),
  // Companion to lastSyncAt for keyset paging: the id of the last row at
  // that updatedAt. Server pages with (updatedAt > since) OR (updatedAt =
  // since AND id > lastSyncedRowId) so a tie at the page boundary can't
  // drop rows from the device mirror.
  lastSyncedRowId: text("last_synced_row_id"),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})
