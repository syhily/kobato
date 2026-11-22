import type { backup } from '@kobato/db/schema/backup'
import type { comment } from '@kobato/db/schema/comment'
import type { auditLog, setting, slugRegistry } from '@kobato/db/schema/config'
import type { content, postSearchIndex } from '@kobato/db/schema/content'
import type { font } from '@kobato/db/schema/font'
import type { friend } from '@kobato/db/schema/friend'
import type { image, music } from '@kobato/db/schema/media'
import type { like, metric } from '@kobato/db/schema/metric'
import type { newsletterSubscriber } from '@kobato/db/schema/newsletter'
import type { notification, notificationRecipient } from '@kobato/db/schema/notification'
import type { oneTimeToken } from '@kobato/db/schema/one-time-token'
import type { page } from '@kobato/db/schema/page'
import type { passkeyCredential } from '@kobato/db/schema/passkey'
import type { post } from '@kobato/db/schema/post'
import type { session } from '@kobato/db/schema/session'
import type { storageMigration } from '@kobato/db/schema/storage-migration'
import type { category, tag } from '@kobato/db/schema/taxonomy'
import type { user, verification } from '@kobato/db/schema/user'
import type { webmention, webmentionInbox, webmentionOutbox } from '@kobato/db/schema/webmention'

export type NewPasskeyCredential = typeof passkeyCredential.$inferInsert
export type NewMetric = typeof metric.$inferInsert
export type NewUser = typeof user.$inferInsert
export type NewLike = typeof like.$inferInsert
export type NewComment = typeof comment.$inferInsert
export type NewVerification = typeof verification.$inferInsert
export type NewSetting = typeof setting.$inferInsert
export type NewFriend = typeof friend.$inferInsert
export type NewCategory = typeof category.$inferInsert
export type NewTag = typeof tag.$inferInsert
export type NewImage = typeof image.$inferInsert
export type NewMusic = typeof music.$inferInsert
export type NewPageMeta = typeof page.$inferInsert
export type NewPostMeta = typeof post.$inferInsert
export type NewContent = typeof content.$inferInsert
export type NewBackup = typeof backup.$inferInsert
export type NewNewsletterSubscriber = typeof newsletterSubscriber.$inferInsert
export type NewNotification = typeof notification.$inferInsert
export type NewNotificationRecipient = typeof notificationRecipient.$inferInsert
export type NewWebmention = typeof webmention.$inferInsert
export type NewWebmentionOutbox = typeof webmentionOutbox.$inferInsert
export type NewWebmentionInbox = typeof webmentionInbox.$inferInsert
export type NewSession = typeof session.$inferInsert
export type NewOneTimeToken = typeof oneTimeToken.$inferInsert
export type NewAuditLog = typeof auditLog.$inferInsert
export type NewFont = typeof font.$inferInsert

export type PasskeyCredentialRow = typeof passkeyCredential.$inferSelect
export type MetricRow = typeof metric.$inferSelect
export type User = typeof user.$inferSelect
export type Like = typeof like.$inferSelect
export type Comment = typeof comment.$inferSelect
export type Verification = typeof verification.$inferSelect
export type Setting = typeof setting.$inferSelect
export type FriendRow = typeof friend.$inferSelect
export type CategoryRow = typeof category.$inferSelect
export type TagRow = typeof tag.$inferSelect
export type ImageRow = typeof image.$inferSelect
export type MusicRow = typeof music.$inferSelect
export type PageMetaRow = typeof page.$inferSelect
export type PostMetaRow = typeof post.$inferSelect
export type ContentRow = typeof content.$inferSelect
export type BackupRow = typeof backup.$inferSelect
export type NewsletterSubscriberRow = typeof newsletterSubscriber.$inferSelect
export type NotificationRow = typeof notification.$inferSelect
export type NotificationRecipientRow = typeof notificationRecipient.$inferSelect
export type WebmentionRow = typeof webmention.$inferSelect
export type WebmentionOutboxRow = typeof webmentionOutbox.$inferSelect
export type WebmentionInboxRow = typeof webmentionInbox.$inferSelect
export type SessionRow = typeof session.$inferSelect
export type OneTimeTokenRow = typeof oneTimeToken.$inferSelect
export type AuditLogRow = typeof auditLog.$inferSelect
export type FontRow = typeof font.$inferSelect
export type SlugRegistryRow = typeof slugRegistry.$inferSelect
export type PostSearchIndexRow = typeof postSearchIndex.$inferSelect
export type StorageMigrationRow = typeof storageMigration.$inferSelect
