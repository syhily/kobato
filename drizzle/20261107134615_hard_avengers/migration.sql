CREATE INDEX `idx_notification_recipient_user_nid` ON `notification_recipient` (`user_id`,`notification_id`);--> statement-breakpoint
ALTER TABLE `notification_recipient` DROP COLUMN `created_at`;