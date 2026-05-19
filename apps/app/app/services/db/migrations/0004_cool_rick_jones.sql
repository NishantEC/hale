-- Outbound queue lease: lets a drainer claim a row by stamping its
-- holder id and an expiry. Concurrent drainers (foreground + background
-- + Force Upload) filter on `claim_expires_at <= now` so they can't
-- double-claim and double-POST the same row. claimedBy is null when no
-- drainer holds the row. claim_expires_at defaults to 0 so legacy rows
-- are immediately claimable.
ALTER TABLE `outbound_queue` ADD COLUMN `claimed_by` text;
--> statement-breakpoint
ALTER TABLE `outbound_queue` ADD COLUMN `claim_expires_at` integer NOT NULL DEFAULT 0;
