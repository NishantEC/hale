-- Drain lock: single-row table that serializes uplink drains across
-- foreground (SyncService interval) and background (Expo TaskManager)
-- JS contexts. Without it, the two can claim the same outbound rows
-- and double-POST to the backend.
CREATE TABLE IF NOT EXISTS `drain_lock` (
	`name` text PRIMARY KEY NOT NULL,
	`acquired_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`holder` text NOT NULL
);
--> statement-breakpoint
-- Exponential-backoff column on outbound_queue: drainers skip rows whose
-- next_attempt_at is in the future. Default 0 so legacy rows ship
-- immediately.
ALTER TABLE `outbound_queue` ADD COLUMN `next_attempt_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Claim-side index: drainer reads `WHERE attempts < N AND next_attempt_at <= now
-- ORDER BY created_at`. This composite avoids a full table scan when the
-- queue grows large (e.g. after an extended offline period).
CREATE INDEX IF NOT EXISTS `outbound_queue_claim_idx`
ON `outbound_queue` (`attempts`, `next_attempt_at`, `created_at`);
