-- High-write tables — indexed for the drainer + dashboard queries.
CREATE INDEX IF NOT EXISTS `raw_sensor_records_user_ts_idx`
  ON `raw_sensor_records` (`user_id`, `timestamp` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `raw_sensor_records_unsynced_idx`
  ON `raw_sensor_records` (`user_id`, `timestamp`) WHERE `_synced_at` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `realtime_samples_user_captured_idx`
  ON `realtime_samples` (`user_id`, `captured_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `realtime_samples_unsynced_idx`
  ON `realtime_samples` (`user_id`, `captured_at`) WHERE `_synced_at` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `device_events_user_captured_idx`
  ON `device_events` (`user_id`, `captured_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `device_events_unsynced_idx`
  ON `device_events` (`user_id`, `captured_at`) WHERE `_synced_at` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `console_logs_user_captured_idx`
  ON `console_logs` (`user_id`, `captured_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `console_logs_unsynced_idx`
  ON `console_logs` (`user_id`, `captured_at`) WHERE `_synced_at` IS NULL;
--> statement-breakpoint
-- Calendar-day-aligned reads on derived tables.
CREATE INDEX IF NOT EXISTS `daily_metrics_user_day_idx`
  ON `daily_metrics` (`user_id`, `day_date` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `daily_scores_user_day_idx`
  ON `daily_scores` (`user_id`, `day_date` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sleep_detections_user_night_idx`
  ON `sleep_detections` (`user_id`, `night_date` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sleep_stages_user_night_idx`
  ON `sleep_stages` (`user_id`, `night_date` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `night_features_user_night_idx`
  ON `night_features` (`user_id`, `night_date` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `activity_detections_user_start_idx`
  ON `activity_detections` (`user_id`, `start_time` DESC);
--> statement-breakpoint
-- Outbound claim is a partial index over eligible rows only.
CREATE INDEX IF NOT EXISTS `outbound_queue_claim_eligible_idx`
  ON `outbound_queue` (`next_attempt_at`, `created_at`)
  WHERE `claim_expires_at` = 0 AND `attempts` < 10;
