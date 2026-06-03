import type { RateLimitSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Input } from '@/ui/components/input'

const BOUNDS = {
  windowSeconds: { min: 60, max: 60 * 60 * 24 },
  maxAttempts: { min: 1, max: 1000 },
} as const

interface RateLimitFormProps {
  rateLimit: RateLimitSettings
}

type BucketKey = keyof RateLimitSettings

const BUCKET_META: Record<BucketKey, { title: string; description: string; windowHint: string; attemptsHint: string }> =
  {
    signInIp: {
      title: '登录限流（按 IP）',
      description: '登录页重试上限。无论登录成功失败都计入计数；失败次数过多会临时锁定该 IP。',
      windowHint: '60 秒 - 24 小时。历史默认 30 分钟（1800）。',
      attemptsHint: '历史默认 5 次。',
    },
    commentPostIp: {
      title: '评论限流（按 IP）',
      description: '匿名评论 / 留言提交按访客 IP 计数。已登录管理员不受限制。',
      windowHint: '60 秒 - 24 小时。历史默认 1 小时（3600）。',
      attemptsHint: '历史默认 12 次。',
    },
    commentPostEmail: {
      title: '评论限流（按邮箱）',
      description: '评论作者邮箱级别的限流。即使从多个 IP 提交，同一邮箱仍然受限。',
      windowHint: '60 秒 - 24 小时。历史默认 1 小时（3600）。',
      attemptsHint: '历史默认 8 次。',
    },
    likeIncreaseIp: {
      title: '点赞限流（按 IP）',
      description: '文章 / 页面「喜欢」按 IP 计数，仅限制新增操作；取消点赞不消耗计数。',
      windowHint: '60 秒 - 24 小时。默认 1 小时（3600）。',
      attemptsHint: '默认 30 次。',
    },
    inviteIp: {
      title: '邀请限流（按 IP）',
      description: '管理员邀请新作者按客户端 IP 计数，避免短时间内被滥用。',
      windowHint: '60 秒 - 24 小时。默认 1 小时（3600）。',
      attemptsHint: '默认 5 次。',
    },
    inviteEmail: {
      title: '邀请限流（按管理员 + 目标邮箱）',
      description: '按「发起邀请的管理员 ID + 目标邮箱」计数。',
      windowHint: '60 秒 - 24 小时。默认 1 小时（3600）。',
      attemptsHint: '默认 1 次。',
    },
    passwordResetIp: {
      title: '密码重置限流（按 IP）',
      description: '公共 lostpassword 表单按客户端 IP 计数。',
      windowHint: '60 秒 - 24 小时。默认 30 分钟（1800）。',
      attemptsHint: '默认 3 次。',
    },
    passwordResetEmail: {
      title: '密码重置限流（按目标邮箱）',
      description: '公共 lostpassword 表单按目标邮箱计数。',
      windowHint: '60 秒 - 24 小时。默认 5 分钟（300）。',
      attemptsHint: '默认 1 次。',
    },
    passwordResetTarget: {
      title: '密码重置限流（按目标用户）',
      description: '管理员触发的"发送密码重置"操作按目标用户 ID 计数。',
      windowHint: '60 秒 - 1 小时。默认 60 秒。',
      attemptsHint: '默认 1 次。',
    },
    resourceIp: {
      title: '公共资源限流（按 IP）',
      description: 'RSS、站点地图、OG 图片、头像等公共资源的访问按客户端 IP 计数。',
      windowHint: '60 秒 - 24 小时。默认 1 分钟（60）。',
      attemptsHint: '默认 60 次。',
    },
    otpSendIp: {
      title: 'OTP 发送限流（按 IP）',
      description: '登录时发送 OTP 验证码邮件按客户端 IP 计数。',
      windowHint: '60 秒 - 24 小时。默认 5 分钟（300）。',
      attemptsHint: '默认 3 次。',
    },
    otpSendEmail: {
      title: 'OTP 发送限流（按邮箱）',
      description: '登录时发送 OTP 验证码邮件按目标邮箱计数。',
      windowHint: '60 秒 - 24 小时。默认 5 分钟（300）。',
      attemptsHint: '默认 1 次。',
    },
    otpVerifyIp: {
      title: 'OTP 验证限流（按 IP）',
      description: 'OTP 验证码校验按客户端 IP 计数。',
      windowHint: '60 秒 - 24 小时。默认 5 分钟（300）。',
      attemptsHint: '默认 5 次。',
    },
    otpVerifyEmail: {
      title: 'OTP 验证限流（按邮箱）',
      description: 'OTP 验证码校验按目标邮箱计数。',
      windowHint: '60 秒 - 24 小时。默认 5 分钟（300）。',
      attemptsHint: '默认 5 次。',
    },
  }

function RateLimitBucketCard({ bucketKey, rateLimit }: { bucketKey: BucketKey; rateLimit: RateLimitSettings }) {
  const meta = BUCKET_META[bucketKey]
  const { mode, form, settingGroupProps, display } = useSettingsCard<
    RateLimitSettings,
    { windowSeconds: number; maxAttempts: number }
  >({
    section: 'rateLimit',
    source: rateLimit,
    toState: (source) => ({
      windowSeconds: source[bucketKey].windowSeconds,
      maxAttempts: source[bucketKey].maxAttempts,
    }),
    fromState: (state) => ({
      [bucketKey]: { windowSeconds: state.windowSeconds, maxAttempts: state.maxAttempts },
    }),
  })

  const bucket = display[bucketKey]

  return (
    <SettingGroup title={meta.title} description={meta.description} {...settingGroupProps}>
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="时间窗口（秒）" htmlFor={`rate-limit-${bucketKey}-window`} hint={meta.windowHint}>
            <Input
              id={`rate-limit-${bucketKey}-window`}
              type="number"
              min={BOUNDS.windowSeconds.min}
              max={BOUNDS.windowSeconds.max}
              {...form.register('windowSeconds', { valueAsNumber: true })}
            />
          </SettingsRow>
          <SettingsRow label="窗口内最多次数" htmlFor={`rate-limit-${bucketKey}-attempts`} hint={meta.attemptsHint}>
            <Input
              id={`rate-limit-${bucketKey}-attempts`}
              type="number"
              min={BOUNDS.maxAttempts.min}
              max={BOUNDS.maxAttempts.max}
              {...form.register('maxAttempts', { valueAsNumber: true })}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="时间窗口" value={`${bucket.windowSeconds.toLocaleString()} 秒`} />
          <SettingValue label="最大尝试次数" value={`${bucket.maxAttempts}`} />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

export function ThresholdForm({ rateLimit }: RateLimitFormProps) {
  const keys = Object.keys(BUCKET_META) as BucketKey[]
  return (
    <div className="flex flex-col gap-5">
      {keys.map((key) => (
        <RateLimitBucketCard key={key} bucketKey={key} rateLimit={rateLimit} />
      ))}
    </div>
  )
}
