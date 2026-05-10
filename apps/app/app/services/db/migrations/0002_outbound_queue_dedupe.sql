-- Make outbound_queue idempotent on (table_name, row_id) so re-syncing the
-- same record doesn't re-enqueue an upload. Without this, every BLE sync
-- re-queues the same rows (the queue id is auto-generated, so no natural
-- collision), which combined with a previously-broken drainer endpoint
-- caused thousands of dead-letter rows.
--
-- 1. Delete any existing duplicates so the unique index can be created.
--    Keep the oldest row per (table_name, row_id) — its createdAt is the
--    real first-seen timestamp.
DELETE FROM `outbound_queue`
WHERE `id` NOT IN (
  SELECT MIN(`id`) FROM `outbound_queue` GROUP BY `table_name`, `row_id`
);
--> statement-breakpoint
-- 2. Add the unique index (no-op if it already exists from a re-run).
CREATE UNIQUE INDEX IF NOT EXISTS `outbound_queue_table_row_unique`
ON `outbound_queue` (`table_name`, `row_id`);
