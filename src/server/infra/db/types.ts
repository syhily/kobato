import type { category, tag } from '@/server/infra/db/schema/taxonomy'
import type { comment } from '@/server/infra/db/schema/comment'
import type { content } from '@/server/infra/db/schema/content'
import type { friend } from '@/server/infra/db/schema/friend'
import type { image, music } from '@/server/infra/db/schema/media'
import type { like, metric } from '@/server/infra/db/schema/metric'
import type { page } from '@/server/infra/db/schema/page'
import type { post } from '@/server/infra/db/schema/post'
import type { setting } from '@/server/infra/db/schema/config'
import type { user, verification } from '@/server/infra/db/schema/user'

// Types for insert
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

// Types for select
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
