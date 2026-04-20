// Inlined to avoid Metro resolver issues with .sql imports.
// Regenerate this file whenever the drizzle schema changes — see
// scripts/generate-migrations.sh (or paste the contents of 0000_init.sql
// into the m0000 template literal below).

const journal = {
  version: "7",
  dialect: "sqlite",
  entries: [
    {
      idx: 0,
      version: "6",
      when: 1776556649513,
      tag: "0000_init",
      breakpoints: true,
    },
  ],
}

const m0000 = `CREATE TABLE \`activity_detections\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`start_time\` integer NOT NULL,
	\`end_time\` integer NOT NULL,
	\`duration_minutes\` real NOT NULL,
	\`activity_type\` text NOT NULL,
	\`intensity\` text NOT NULL,
	\`confidence\` real NOT NULL,
	\`heart_rate_avg\` real NOT NULL,
	\`heart_rate_max\` real NOT NULL,
	\`strain_score\` real NOT NULL,
	\`cadence_hz\` real,
	\`source\` text DEFAULT 'detected' NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`baseline_profile\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`resting_heart_rate\` real DEFAULT 0 NOT NULL,
	\`rmssd\` real DEFAULT 0 NOT NULL,
	\`sdnn\` real DEFAULT 0 NOT NULL,
	\`nights_used\` integer DEFAULT 0 NOT NULL,
	\`max_heart_rate\` real,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`console_logs\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`device_id\` text NOT NULL,
	\`message\` text NOT NULL,
	\`log_level\` text,
	\`metadata\` text,
	\`captured_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`daily_metrics\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`day_date\` integer NOT NULL,
	\`stress_average\` real,
	\`spo2_average\` real,
	\`skin_temp_avg_celsius\` real,
	\`skin_temp_delta_celsius\` real,
	\`strain_score\` real,
	\`sleep_consistency_score\` real,
	\`detected_sleep_nights\` integer DEFAULT 0 NOT NULL,
	\`lf_hf_ratio_average\` real,
	\`recovery_index\` real,
	\`training_load_ratio\` real,
	\`training_load_risk_zone\` text,
	\`spo2_dip_count\` integer,
	\`odi_per_hour\` real,
	\`lowest_spo2\` real,
	\`core_temperature_estimate\` real,
	\`circadian_nadir\` integer,
	\`sleep_architecture_score\` real,
	\`active_minutes\` real,
	\`activity_count\` integer,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`daily_scores\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`day_date\` integer NOT NULL,
	\`daily_balance\` integer DEFAULT 0 NOT NULL,
	\`load_pressure\` integer DEFAULT 0 NOT NULL,
	\`sleep_reserve_hours\` real DEFAULT 0 NOT NULL,
	\`confidence\` text DEFAULT 'Low' NOT NULL,
	\`recommendation\` text DEFAULT 'Steady' NOT NULL,
	\`detail\` text DEFAULT '' NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`device_events\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`device_id\` text NOT NULL,
	\`event_number\` integer NOT NULL,
	\`event_name\` text NOT NULL,
	\`raw_payload\` text,
	\`captured_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`journal_entries\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`timestamp\` integer NOT NULL,
	\`factor_tag\` text NOT NULL,
	\`intensity\` integer NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	\`created_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`night_features\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`night_date\` integer NOT NULL,
	\`resting_heart_rate\` real DEFAULT 0 NOT NULL,
	\`rmssd\` real DEFAULT 0 NOT NULL,
	\`sdnn\` real DEFAULT 0 NOT NULL,
	\`respiratory_rate\` real DEFAULT 0 NOT NULL,
	\`continuity\` real DEFAULT 0 NOT NULL,
	\`regularity\` real DEFAULT 0 NOT NULL,
	\`valid_coverage\` real DEFAULT 0 NOT NULL,
	\`confidence_raw\` real DEFAULT 0 NOT NULL,
	\`sleep_estimate_hours\` real DEFAULT 0 NOT NULL,
	\`source_blend\` text DEFAULT 'Unknown' NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`outbound_queue\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`table_name\` text NOT NULL,
	\`row_id\` text NOT NULL,
	\`payload\` text NOT NULL,
	\`attempts\` integer DEFAULT 0 NOT NULL,
	\`last_attempt_at\` integer,
	\`last_error\` text,
	\`created_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`raw_sensor_records\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`timestamp\` integer NOT NULL,
	\`heart_rate\` real DEFAULT 0 NOT NULL,
	\`rr_average_ms\` real,
	\`spo2_red\` real,
	\`spo2_ir\` real,
	\`skin_temp_raw\` real,
	\`gravity_magnitude\` real,
	\`gravity_x\` real,
	\`gravity_y\` real,
	\`gravity_z\` real,
	\`resp_rate_raw\` real,
	\`skin_contact\` integer,
	\`ppg_green\` real,
	\`ppg_red_ir\` real,
	\`ambient_light\` real,
	\`led_drive_1\` real,
	\`led_drive_2\` real,
	\`signal_quality\` real,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`realtime_samples\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`device_id\` text NOT NULL,
	\`session_id\` text NOT NULL,
	\`data_type\` text NOT NULL,
	\`heart_rate\` integer,
	\`raw_fields\` text,
	\`raw_payload\` text,
	\`captured_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`settings\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`value\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`signal_samples\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`timestamp\` integer NOT NULL,
	\`source\` text DEFAULT 'strap' NOT NULL,
	\`heart_rate\` real,
	\`ibi_ms\` real,
	\`motion_score\` real,
	\`quality_score\` real,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`sleep_detections\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`night_date\` integer NOT NULL,
	\`bedtime\` integer,
	\`wake_time\` integer,
	\`duration_hours\` real DEFAULT 0 NOT NULL,
	\`interruption_count\` integer DEFAULT 0 NOT NULL,
	\`continuity\` real DEFAULT 0 NOT NULL,
	\`regularity\` real DEFAULT 0 NOT NULL,
	\`valid_coverage\` real DEFAULT 0 NOT NULL,
	\`confidence\` real DEFAULT 0 NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`sleep_plans\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`target_sleep_minutes\` integer DEFAULT 480 NOT NULL,
	\`wake_minutes\` integer DEFAULT 420 NOT NULL,
	\`alarm_enabled\` integer DEFAULT 0 NOT NULL,
	\`alarm_minutes\` integer DEFAULT 420 NOT NULL,
	\`smart_wake_enabled\` integer DEFAULT 0 NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`sleep_stages\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`night_date\` integer NOT NULL,
	\`rem_minutes\` integer DEFAULT 0 NOT NULL,
	\`core_minutes\` integer DEFAULT 0 NOT NULL,
	\`deep_minutes\` integer DEFAULT 0 NOT NULL,
	\`awake_minutes\` integer DEFAULT 0 NOT NULL,
	\`unknown_minutes\` integer DEFAULT 0 NOT NULL,
	\`confidence\` real DEFAULT 0 NOT NULL,
	\`source\` text DEFAULT 'Strap' NOT NULL,
	\`epoch_timeline\` text,
	\`epoch_minutes\` integer DEFAULT 1 NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`_synced_at\` integer,
	\`_local_created_at\` integer NOT NULL,
	\`_origin\` text NOT NULL,
	\`user_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`sync_state\` (
	\`table_name\` text PRIMARY KEY NOT NULL,
	\`last_sync_at\` integer DEFAULT 0 NOT NULL,
	\`last_synced_row_timestamp\` integer
);
--> statement-breakpoint
CREATE TABLE \`view_cache\` (
	\`view_name\` text NOT NULL,
	\`date\` text NOT NULL,
	\`payload\` text NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`user_id\` text NOT NULL,
	PRIMARY KEY(\`view_name\`, \`date\`, \`user_id\`)
);`

module.exports = {
  journal,
  migrations: {
    m0000,
  },
}
