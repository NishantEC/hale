-- Keyset pagination cursor: store both updatedAt (lastSyncAt) AND the
-- last row id we saw, so a page-boundary tie on updatedAt doesn't make
-- the next page skip rows (codex adversarial review 2026-05-21,
-- finding #2). NULL on rows that haven't been pulled with the new
-- protocol yet — server treats missing cursorId as "page from since".
ALTER TABLE `sync_state` ADD COLUMN `last_synced_row_id` text;
