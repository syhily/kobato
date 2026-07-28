import type { RateLimitSettings } from '@/shared/config/types'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

export type BucketKey = keyof RateLimitSettings

export interface QuickOption {
  label: string
  seconds: number
}

export const BUCKET_META: Record<
  BucketKey,
  {
    title: string
    description: string
    group: string
    quickWindowOptions: QuickOption[]
  }
> = {
  signInIp: {
    title: '登录限流（按 IP）',
    description: '登录页重试上限。无论登录成功失败都计入计数；失败次数过多会临时锁定该 IP。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
      { label: '1小时', seconds: 3600 },
    ],
  },
  signInEmail: {
    title: '登录限流（按邮箱）',
    description: '登录页重试按目标邮箱计数。即使从多个 IP 提交，同一邮箱仍然受限。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
      { label: '1小时', seconds: 3600 },
    ],
  },
  otpSendIp: {
    title: 'OTP 发送限流（按 IP）',
    description: '登录时发送 OTP 验证码邮件按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  otpSendEmail: {
    title: 'OTP 发送限流（按邮箱）',
    description: '登录时发送 OTP 验证码邮件按目标邮箱计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  otpVerifyIp: {
    title: 'OTP 验证限流（按 IP）',
    description: 'OTP 验证码校验按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  otpVerifyEmail: {
    title: 'OTP 验证限流（按邮箱）',
    description: 'OTP 验证码校验按目标邮箱计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passwordResetIp: {
    title: '密码重置限流（按 IP）',
    description: '公共 lostpassword 表单按客户端 IP 计数。',
    group: '密码重置',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passwordResetEmail: {
    title: '密码重置限流（按目标邮箱）',
    description: '公共 lostpassword 表单按目标邮箱计数。',
    group: '密码重置',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passwordResetTarget: {
    title: '密码重置限流（按目标用户）',
    description: '管理员触发的"发送密码重置"操作按目标用户 ID 计数。',
    group: '密码重置',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  commentPostIp: {
    title: '评论限流（按 IP）',
    description: '匿名评论 / 留言提交按访客 IP 计数。已登录管理员不受限制。',
    group: '评论互动',
    quickWindowOptions: [
      { label: '1小时', seconds: 3600 },
      { label: '6小时', seconds: 21600 },
      { label: '12小时', seconds: 43200 },
      { label: '24小时', seconds: 86400 },
    ],
  },
  commentPostEmail: {
    title: '评论限流（按邮箱）',
    description: '评论作者邮箱级别的限流。即使从多个 IP 提交，同一邮箱仍然受限。',
    group: '评论互动',
    quickWindowOptions: [
      { label: '1小时', seconds: 3600 },
      { label: '6小时', seconds: 21600 },
      { label: '12小时', seconds: 43200 },
      { label: '24小时', seconds: 86400 },
    ],
  },
  likeIncreaseIp: {
    title: '点赞限流（按 IP）',
    description: '文章 / 页面「喜欢」按 IP 计数，仅限制新增操作；取消点赞不消耗计数。',
    group: '评论互动',
    quickWindowOptions: [
      { label: '1小时', seconds: 3600 },
      { label: '6小时', seconds: 21600 },
      { label: '12小时', seconds: 43200 },
      { label: '24小时', seconds: 86400 },
    ],
  },
  inviteIp: {
    title: '邀请限流（按 IP）',
    description: '管理员邀请新作者按客户端 IP 计数，避免短时间内被滥用。',
    group: '管理操作',
    quickWindowOptions: [
      { label: '1小时', seconds: 3600 },
      { label: '6小时', seconds: 21600 },
      { label: '12小时', seconds: 43200 },
      { label: '24小时', seconds: 86400 },
    ],
  },
  inviteEmail: {
    title: '邀请限流（按管理员 + 目标邮箱）',
    description: '按「发起邀请的管理员 ID + 目标邮箱」计数。',
    group: '管理操作',
    quickWindowOptions: [
      { label: '1小时', seconds: 3600 },
      { label: '6小时', seconds: 21600 },
      { label: '12小时', seconds: 43200 },
      { label: '24小时', seconds: 86400 },
    ],
  },
  resourceIp: {
    title: '公共资源限流（按 IP）',
    description: 'RSS、站点地图、OG 图片、头像等公共资源的访问按客户端 IP 计数。',
    group: '公共资源',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
      { label: '1小时', seconds: 3600 },
    ],
  },
  passkeyAuthBeginIp: {
    title: 'Passkey 登录限流（按 IP）',
    description: 'Passkey 认证挑战请求按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passkeyAuthFinishIp: {
    title: 'Passkey 认证完成',
    description: 'Passkey 认证完成请求按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passkeyRegisterBeginIp: {
    title: 'Passkey 注册限流（按 IP）',
    description: 'Passkey 注册挑战请求按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passkeyRegisterFinishIp: {
    title: 'Passkey 注册完成限流（按 IP）',
    description: 'Passkey 注册完成请求按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passkeySetForceIp: {
    title: '登陆方式变更限流（按 IP）',
    description: '切换登陆方式（密码 / 邮箱链接 / Passkey）按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
  passkeyDeleteIp: {
    title: 'Passkey 删除限流（按 IP）',
    description: 'Passkey 凭据删除操作按客户端 IP 计数。',
    group: '认证与登录',
    quickWindowOptions: [
      { label: '1分', seconds: 60 },
      { label: '5分', seconds: 300 },
      { label: '15分', seconds: 900 },
      { label: '30分', seconds: 1800 },
    ],
  },
}

// Groupings derived from each bucket's `group` field. First-appearance
// order in BUCKET_META fixes both the group order and the key order
// within a group, so rendering stays deterministic.
export const GROUPS: { label: string; keys: BucketKey[] }[] = (() => {
  const groups = new Map<string, BucketKey[]>()
  // BUCKET_META is a full Record<BucketKey, …>, so its entries are
  // exactly the bucket key set — the same narrowing Object.fromEntries
  // needs elsewhere.
  for (const [key, meta] of unsafeCast<[BucketKey, (typeof BUCKET_META)[BucketKey]][]>(Object.entries(BUCKET_META))) {
    const keys = groups.get(meta.group)
    if (keys) {
      keys.push(key)
    } else {
      groups.set(meta.group, [key])
    }
  }
  return [...groups].map(([label, keys]) => ({ label, keys }))
})()
