CREATE TABLE `backup` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`timestamp` text NOT NULL,
	`storage_path` text NOT NULL,
	`storage_driver` text DEFAULT 's3' NOT NULL,
	`byte_size` integer NOT NULL,
	`created_by` integer,
	CONSTRAINT "backup_storage_driver_chk" CHECK("storage_driver" IN ('s3', 'local'))
);
--> statement-breakpoint
CREATE TABLE `comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`content` text DEFAULT '',
	`body` text NOT NULL,
	`type` text NOT NULL,
	`owner_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`is_verified` integer DEFAULT false,
	`ua` text,
	`ip` text,
	`rid` integer DEFAULT 0 NOT NULL,
	`is_collapsed` integer DEFAULT false,
	`is_pending` integer DEFAULT false,
	`is_pinned` integer DEFAULT false,
	`content_hash` text,
	`vote_up` integer DEFAULT 0 NOT NULL,
	`vote_down` integer DEFAULT 0 NOT NULL,
	`root_id` integer,
	`delete_requested_at` integer,
	`delete_requested_by` integer
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`action` text NOT NULL,
	`actor_id` integer,
	`actor_role` text,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`details` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_audit_log_actor_id_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`scope` text DEFAULT 'blog' NOT NULL UNIQUE,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer
);
--> statement-breakpoint
CREATE TABLE `slug_registry` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`slug` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`type` text NOT NULL,
	`owner_id` integer NOT NULL,
	`revision_no` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`body` text NOT NULL,
	`image_sources` text NOT NULL,
	`headings` text NOT NULL,
	`author_id` integer,
	`client_revision_token` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `post_search_index` (
	`post_id` integer PRIMARY KEY,
	`plain_text` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `font` (
	`id` text PRIMARY KEY,
	`family_name` text NOT NULL,
	`source_name` text NOT NULL,
	`hash` text NOT NULL UNIQUE,
	`css_key` text NOT NULL,
	`storage_driver` text NOT NULL,
	`chunk_count` integer NOT NULL,
	`total_bytes` integer NOT NULL,
	`etag` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `friend` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`website` text NOT NULL,
	`description` text,
	`homepage` text NOT NULL,
	`poster` text NOT NULL,
	`rss_url` text,
	`visible` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kv_cache` (
	`key` text PRIMARY KEY,
	`bucket` text NOT NULL,
	`value` text,
	`blob` blob,
	`expires_at` integer
);
--> statement-breakpoint
CREATE TABLE `image` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`storage_path` text NOT NULL UNIQUE,
	`storage_driver` text DEFAULT 's3' NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`thumbhash` text,
	`uploader_id` integer,
	`note` text,
	CONSTRAINT "image_storage_driver_chk" CHECK("storage_driver" IN ('s3', 'local'))
);
--> statement-breakpoint
CREATE TABLE `music` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`player_id` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`artist` text NOT NULL,
	`album` text NOT NULL,
	`audio_storage_path` text NOT NULL UNIQUE,
	`cover_storage_path` text NOT NULL UNIQUE,
	`storage_driver` text DEFAULT 's3' NOT NULL,
	`lyric` text,
	`uploader_id` integer,
	CONSTRAINT "music_storage_driver_chk" CHECK("storage_driver" IN ('s3', 'local'))
);
--> statement-breakpoint
CREATE TABLE `like` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer,
	`updated_at` integer,
	`deleted_at` integer,
	`token` text,
	`type` text NOT NULL,
	`owner_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metric` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`type` text NOT NULL,
	`owner_id` integer NOT NULL,
	`public_id` text NOT NULL,
	`vote_up` integer,
	`vote_down` integer,
	`pv` integer
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscriber` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`confirm_token_hash` text,
	`confirm_token_expires_at` integer,
	`confirmed_at` integer,
	`unsubscribed_at` integer,
	CONSTRAINT "newsletter_subscriber_status_chk" CHECK("status" IN ('pending', 'confirmed', 'unsubscribed'))
);
--> statement-breakpoint
CREATE TABLE `one_time_token` (
	`key` text PRIMARY KEY,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`slug` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`cover` text DEFAULT '' NOT NULL,
	`og` text,
	`published` integer DEFAULT true NOT NULL,
	`comments_enabled` integer DEFAULT true NOT NULL,
	`webmentions_enabled` integer DEFAULT true NOT NULL,
	`show_toc` integer DEFAULT false NOT NULL,
	`show_updated` integer DEFAULT false NOT NULL,
	`show_friends` integer DEFAULT false NOT NULL,
	`published_at` integer NOT NULL,
	`published_revision_id` integer,
	`first_published_at` integer,
	`author_id` integer
);
--> statement-breakpoint
CREATE TABLE `passkey_credential` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` integer NOT NULL,
	`credential_id` text NOT NULL UNIQUE,
	`public_key` blob NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_name` text,
	`backed_up` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_passkey_credential_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `post_tag` (
	`post_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	CONSTRAINT `post_tag_pk` PRIMARY KEY(`post_id`, `tag_id`),
	CONSTRAINT `fk_post_tag_post_id_post_id_fk` FOREIGN KEY (`post_id`) REFERENCES `post`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_post_tag_tag_id_tag_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `post` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`slug` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`cover` text DEFAULT '' NOT NULL,
	`og` text,
	`published` integer DEFAULT true NOT NULL,
	`comments_enabled` integer DEFAULT true NOT NULL,
	`webmentions_enabled` integer DEFAULT true NOT NULL,
	`show_toc` integer DEFAULT false NOT NULL,
	`show_updated` integer DEFAULT false NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`published_at` integer NOT NULL,
	`published_revision_id` integer,
	`first_published_at` integer,
	`author_id` integer,
	`category_id` integer,
	`alias` text NOT NULL,
	`pinned_at` integer,
	CONSTRAINT `fk_post_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`user_id` integer,
	`data` text NOT NULL,
	`user_agent` text,
	`platform_hint` text,
	`ip` text,
	`login_at` integer,
	`last_active_at` integer,
	`expires_at` integer NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL UNIQUE,
	`slug` text NOT NULL UNIQUE,
	`cover` text NOT NULL,
	`og` text,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL UNIQUE,
	`slug` text NOT NULL UNIQUE,
	`og_image` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`link` text,
	`password` text NOT NULL,
	`badge_name` text,
	`badge_color` text,
	`badge_text_color` text,
	`last_ip` text,
	`last_ua` text,
	`role` text,
	`is_muted` integer DEFAULT false NOT NULL,
	`receive_email` integer DEFAULT true,
	`login_method` text DEFAULT 'password' NOT NULL,
	CONSTRAINT "user_role_chk" CHECK("role" IN ('admin', 'author', 'visitor'))
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	`user_id` integer NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webmention` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`type` text DEFAULT 'mention' NOT NULL,
	`target_type` text NOT NULL,
	`target_owner_id` integer NOT NULL,
	`verification_status` text DEFAULT 'verified' NOT NULL,
	`last_verified_at` integer,
	`last_error` text,
	`verify_fail_streak` integer DEFAULT 0 NOT NULL,
	`author_name` text,
	`title` text,
	`summary` text,
	`moderated_at` integer,
	CONSTRAINT "webmention_status_chk" CHECK("status" IN ('pending', 'approved', 'rejected', 'hidden')),
	CONSTRAINT "webmention_type_chk" CHECK("type" IN ('mention', 'reply', 'like', 'repost')),
	CONSTRAINT "webmention_verification_chk" CHECK("verification_status" IN ('verified', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `webmention_inbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `webmention_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`endpoint` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` integer,
	`last_error` text,
	`sent_at` integer,
	CONSTRAINT "webmention_outbox_status_chk" CHECK("status" IN ('pending', 'sent', 'no-endpoint', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_backup_storage_path` ON `backup` (`storage_path`);--> statement-breakpoint
CREATE INDEX `idx_backup_created_at` ON `backup` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comment_root_id` ON `comment` (`root_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_rid` ON `comment` (`rid`);--> statement-breakpoint
CREATE INDEX `idx_comment_user_id` ON `comment` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_owner` ON `comment` (`type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_deleted_at` ON `comment` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_comment_delete_requested_at` ON `comment` (`delete_requested_at`);--> statement-breakpoint
CREATE INDEX `idx_comment_thread` ON `comment` (`type`,`owner_id`,`root_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_content_hash` ON `comment` (`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_actor` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_resource` ON `audit_log` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_created_at` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_action_created_at` ON `audit_log` (`action`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_slug_registry_slug` ON `slug_registry` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_slug_registry_entity` ON `slug_registry` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_content_owner_revision` ON `content` (`type`,`owner_id`,`revision_no`);--> statement-breakpoint
CREATE INDEX `idx_content_owner_status` ON `content` (`type`,`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_content_status` ON `content` (`status`);--> statement-breakpoint
CREATE INDEX `font_family_idx` ON `font` (`family_name`);--> statement-breakpoint
CREATE INDEX `idx_friend_visible` ON `friend` (`visible`);--> statement-breakpoint
CREATE INDEX `idx_friend_homepage` ON `friend` (`homepage`);--> statement-breakpoint
CREATE INDEX `idx_kv_cache_bucket` ON `kv_cache` (`bucket`);--> statement-breakpoint
CREATE INDEX `idx_kv_cache_expires_at` ON `kv_cache` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_image_created_at` ON `image` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_image_deleted_at` ON `image` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_music_source_source_id` ON `music` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_music_created_at` ON `music` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_music_deleted_at` ON `music` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_like_token` ON `like` (`token`);--> statement-breakpoint
CREATE INDEX `idx_like_owner` ON `like` (`type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_metric_public_id` ON `metric` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_metric_owner` ON `metric` (`type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_metric_deleted_at` ON `metric` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_newsletter_subscriber_email` ON `newsletter_subscriber` (`email`);--> statement-breakpoint
CREATE INDEX `idx_newsletter_subscriber_status` ON `newsletter_subscriber` (`status`);--> statement-breakpoint
CREATE INDEX `idx_newsletter_subscriber_confirm_token_hash` ON `newsletter_subscriber` (`confirm_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_one_time_token_expires_at` ON `one_time_token` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_page_deleted_at` ON `page` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_page_first_published_at` ON `page` (`first_published_at`);--> statement-breakpoint
CREATE INDEX `idx_page_catalog` ON `page` (`deleted_at`,`published`,`first_published_at`);--> statement-breakpoint
CREATE INDEX `idx_page_author_id` ON `page` (`author_id`);--> statement-breakpoint
CREATE INDEX `passkey_credential_user_id_idx` ON `passkey_credential` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_post_tag_tag_id` ON `post_tag` (`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_post_deleted_at` ON `post` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_post_category_id` ON `post` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_post_published_at` ON `post` (`published_at`);--> statement-breakpoint
CREATE INDEX `idx_post_first_published_at` ON `post` (`first_published_at`);--> statement-breakpoint
CREATE INDEX `idx_post_pinned_at` ON `post` (`pinned_at`);--> statement-breakpoint
CREATE INDEX `idx_post_catalog` ON `post` (`deleted_at`,`published`,`first_published_at`);--> statement-breakpoint
CREATE INDEX `idx_post_live_gate` ON `post` (`deleted_at`,`published`,`visible`,`published_at`,`published_revision_id`);--> statement-breakpoint
CREATE INDEX `idx_post_author_id` ON `post` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_session_expires_at` ON `session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_category_sort_order` ON `category` (`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_users_name` ON `user` (`name`);--> statement-breakpoint
CREATE INDEX `idx_users_deleted_at` ON `user` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_user_role` ON `user` (`role`) WHERE role IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_verification_value` ON `verification` (`value`);--> statement-breakpoint
CREATE INDEX `idx_verification_expires_at` ON `verification` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_verification_purpose_user` ON `verification` (`purpose`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_webmention_pair` ON `webmention` (`source_url`,`target_url`);--> statement-breakpoint
CREATE INDEX `idx_webmention_status` ON `webmention` (`status`);--> statement-breakpoint
CREATE INDEX `idx_webmention_target` ON `webmention` (`target_type`,`target_owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_webmention_inbox_pair` ON `webmention_inbox` (`source_url`,`target_url`);--> statement-breakpoint
CREATE INDEX `idx_webmention_inbox_pick` ON `webmention_inbox` (`next_retry_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_webmention_outbox_pair` ON `webmention_outbox` (`source_url`,`target_url`);--> statement-breakpoint
CREATE INDEX `idx_webmention_outbox_pick` ON `webmention_outbox` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `idx_webmention_outbox_source` ON `webmention_outbox` (`source_url`);