import type { RateLimitSettings } from '@/shared/config/types'

export type BucketKey = keyof RateLimitSettings

export interface QuickOption {
  label: string
  seconds: number
}

// Three shared quick-pick profiles cover every scenario — the per-bucket
// copies used to be duplicated across the whole table.
const QUICK_AUTH: QuickOption[] = [
  { label: '5分', seconds: 300 },
  { label: '15分', seconds: 900 },
  { label: '30分', seconds: 1800 },
  { label: '1小时', seconds: 3600 },
]

const QUICK_SHORT: QuickOption[] = [
  { label: '1分', seconds: 60 },
  { label: '5分', seconds: 300 },
  { label: '15分', seconds: 900 },
  { label: '30分', seconds: 1800 },
]

const QUICK_LONG: QuickOption[] = [
  { label: '1小时', seconds: 3600 },
  { label: '6小时', seconds: 21600 },
  { label: '12小时', seconds: 43200 },
  { label: '24小时', seconds: 86400 },
]

export const BUCKET_META: Record<
  BucketKey,
  {
    title: string
    description: string
    quickWindowOptions: QuickOption[]
  }
> = {
  signIn: {
    title: '登录限流',
    description:
      '登录页重试上限，按客户端 IP 与目标邮箱分别计数、共用此配置。无论登录成功失败都计入；失败次数过多会临时锁定。',
    quickWindowOptions: QUICK_AUTH,
  },
  comment: {
    title: '评论限流',
    description: '匿名评论 / 留言提交，按访客 IP 与作者邮箱分别计数、共用此配置。已登录管理员不受限制。',
    quickWindowOptions: QUICK_LONG,
  },
  like: {
    title: '点赞限流',
    description: '文章 / 页面「喜欢」按 IP 计数，仅限制新增操作；取消点赞不消耗计数。',
    quickWindowOptions: QUICK_LONG,
  },
  resource: {
    title: '公共资源限流',
    description: 'RSS、站点地图、OG 图片、头像等公共资源的访问按客户端 IP 计数。',
    quickWindowOptions: [...QUICK_SHORT, { label: '1小时', seconds: 3600 }],
  },
  otpSend: {
    title: 'OTP 发送限流',
    description: '登录时发送 OTP 验证码邮件，按客户端 IP 与目标邮箱分别计数、共用此配置。',
    quickWindowOptions: QUICK_SHORT,
  },
  otpVerify: {
    title: 'OTP 验证限流',
    description: 'OTP 验证码校验，按客户端 IP 与目标邮箱分别计数、共用此配置。',
    quickWindowOptions: QUICK_SHORT,
  },
  passkeyAuth: {
    title: 'Passkey 登录限流',
    description: 'Passkey 认证挑战与认证完成请求按客户端 IP 计数。',
    quickWindowOptions: QUICK_SHORT,
  },
  passkeyManage: {
    title: 'Passkey 管理限流',
    description: 'Passkey 注册、凭据删除与登录方式变更（密码 / 邮箱链接 / Passkey）按客户端 IP 计数。',
    quickWindowOptions: QUICK_SHORT,
  },
  passwordReset: {
    title: '密码重置限流',
    description: '公共 lostpassword 表单，按客户端 IP 与目标邮箱分别计数、共用此配置。',
    quickWindowOptions: QUICK_SHORT,
  },
  passwordResetTarget: {
    title: '密码重置限流（按目标用户）',
    description: '管理员触发的「发送密码重置」操作按目标用户 ID 计数。',
    quickWindowOptions: QUICK_SHORT,
  },
  invite: {
    title: '邀请限流',
    description: '管理员邀请新作者，按客户端 IP 与「管理员 + 目标邮箱」分别计数、共用此配置。',
    quickWindowOptions: QUICK_LONG,
  },
}

/** Everyday scenarios — always visible in the card. */
export const COMMON_KEYS: readonly BucketKey[] = ['signIn', 'comment', 'like', 'resource']

/** Advanced scenarios — grouped behind the 高级选项 disclosure. */
export const ADVANCED_GROUPS: readonly { label: string; keys: readonly BucketKey[] }[] = [
  { label: '认证与登录', keys: ['otpSend', 'otpVerify', 'passkeyAuth', 'passkeyManage'] },
  { label: '密码重置', keys: ['passwordReset', 'passwordResetTarget'] },
  { label: '管理操作', keys: ['invite'] },
]

/** Every bucket, common first — the reset-all iteration order. */
export const ALL_KEYS: readonly BucketKey[] = [...COMMON_KEYS, ...ADVANCED_GROUPS.flatMap((group) => group.keys)]
