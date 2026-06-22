DROP INDEX IF EXISTS `raw_sensor_records_unsynced_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `realtime_samples_unsynced_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `device_events_unsynced_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `console_logs_unsynced_idx`;--> statement-breakpoint
DROP TABLE `drain_lock`;--> statement-breakpoint
DROP TABLE `outbound_queue`;--> statement-breakpoint
ALTER TABLE `activity_detections` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `baseline_profile` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `console_logs` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `daily_metrics` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `daily_scores` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `device_events` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `journal_entries` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `night_features` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `raw_sensor_records` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `realtime_samples` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `signal_samples` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `sleep_detections` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `sleep_plans` DROP COLUMN `_synced_at`;--> statement-breakpoint
ALTER TABLE `sleep_stages` DROP COLUMN `_synced_at`;