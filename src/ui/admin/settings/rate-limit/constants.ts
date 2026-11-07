import type { RateLimitSettings } from '@/shared/config/types'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export type BucketKey = keyof RateLimitSettings

export interface QuickOption {
  labelId: UiMessageId
  seconds: number
}

// Three shared quick-pick profiles cover every scenario — the per-bucket
// copies used to be duplicated across the whole table.
const QUICK_AUTH: QuickOption[] = [
  { labelId: 'admin.settings.rateLimit.quick.5m', seconds: 300 },
  { labelId: 'admin.settings.rateLimit.quick.15m', seconds: 900 },
  { labelId: 'admin.settings.rateLimit.quick.30m', seconds: 1800 },
  { labelId: 'admin.settings.rateLimit.quick.1h', seconds: 3600 },
]

const QUICK_SHORT: QuickOption[] = [
  { labelId: 'admin.settings.rateLimit.quick.1m', seconds: 60 },
  { labelId: 'admin.settings.rateLimit.quick.5m', seconds: 300 },
  { labelId: 'admin.settings.rateLimit.quick.15m', seconds: 900 },
  { labelId: 'admin.settings.rateLimit.quick.30m', seconds: 1800 },
]

const QUICK_LONG: QuickOption[] = [
  { labelId: 'admin.settings.rateLimit.quick.1h', seconds: 3600 },
  { labelId: 'admin.settings.rateLimit.quick.6h', seconds: 21600 },
  { labelId: 'admin.settings.rateLimit.quick.12h', seconds: 43200 },
  { labelId: 'admin.settings.rateLimit.quick.24h', seconds: 86400 },
]

export const BUCKET_META: Record<
  BucketKey,
  {
    titleId: UiMessageId
    descriptionId: UiMessageId
    quickWindowOptions: QuickOption[]
  }
> = {
  signIn: {
    titleId: 'admin.settings.rateLimit.bucket.signIn.title',
    descriptionId: 'admin.settings.rateLimit.bucket.signIn.description',
    quickWindowOptions: QUICK_AUTH,
  },
  comment: {
    titleId: 'admin.settings.rateLimit.bucket.comment.title',
    descriptionId: 'admin.settings.rateLimit.bucket.comment.description',
    quickWindowOptions: QUICK_LONG,
  },
  like: {
    titleId: 'admin.settings.rateLimit.bucket.like.title',
    descriptionId: 'admin.settings.rateLimit.bucket.like.description',
    quickWindowOptions: QUICK_LONG,
  },
  resource: {
    titleId: 'admin.settings.rateLimit.bucket.resource.title',
    descriptionId: 'admin.settings.rateLimit.bucket.resource.description',
    quickWindowOptions: [...QUICK_SHORT, { labelId: 'admin.settings.rateLimit.quick.1h', seconds: 3600 }],
  },
  otpSend: {
    titleId: 'admin.settings.rateLimit.bucket.otpSend.title',
    descriptionId: 'admin.settings.rateLimit.bucket.otpSend.description',
    quickWindowOptions: QUICK_SHORT,
  },
  otpVerify: {
    titleId: 'admin.settings.rateLimit.bucket.otpVerify.title',
    descriptionId: 'admin.settings.rateLimit.bucket.otpVerify.description',
    quickWindowOptions: QUICK_SHORT,
  },
  passkeyAuth: {
    titleId: 'admin.settings.rateLimit.bucket.passkeyAuth.title',
    descriptionId: 'admin.settings.rateLimit.bucket.passkeyAuth.description',
    quickWindowOptions: QUICK_SHORT,
  },
  passkeyManage: {
    titleId: 'admin.settings.rateLimit.bucket.passkeyManage.title',
    descriptionId: 'admin.settings.rateLimit.bucket.passkeyManage.description',
    quickWindowOptions: QUICK_SHORT,
  },
  passwordReset: {
    titleId: 'admin.settings.rateLimit.bucket.passwordReset.title',
    descriptionId: 'admin.settings.rateLimit.bucket.passwordReset.description',
    quickWindowOptions: QUICK_SHORT,
  },
  passwordResetTarget: {
    titleId: 'admin.settings.rateLimit.bucket.passwordResetTarget.title',
    descriptionId: 'admin.settings.rateLimit.bucket.passwordResetTarget.description',
    quickWindowOptions: QUICK_SHORT,
  },
  invite: {
    titleId: 'admin.settings.rateLimit.bucket.invite.title',
    descriptionId: 'admin.settings.rateLimit.bucket.invite.description',
    quickWindowOptions: QUICK_LONG,
  },
}

/** Everyday scenarios — always visible in the card. */
export const COMMON_KEYS: readonly BucketKey[] = ['signIn', 'comment', 'like', 'resource']

/** Advanced scenarios — grouped behind the 高级选项 disclosure. */
export const ADVANCED_GROUPS: readonly { labelId: UiMessageId; keys: readonly BucketKey[] }[] = [
  { labelId: 'admin.settings.rateLimit.group.auth', keys: ['otpSend', 'otpVerify', 'passkeyAuth', 'passkeyManage'] },
  { labelId: 'admin.settings.rateLimit.group.passwordReset', keys: ['passwordReset', 'passwordResetTarget'] },
  { labelId: 'admin.settings.rateLimit.group.admin', keys: ['invite'] },
]

/** Every bucket, common first — the reset-all iteration order. */
export const ALL_KEYS: readonly BucketKey[] = [...COMMON_KEYS, ...ADVANCED_GROUPS.flatMap((group) => group.keys)]
