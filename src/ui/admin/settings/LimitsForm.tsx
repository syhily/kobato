import type { LimitsSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Input } from '@/ui/components/input'

interface LimitsFormProps {
  limits: LimitsSettings
}

const BOUNDS = {
  maxRequestBodySize: { min: 1024, max: 100 * 1024 * 1024 },
  sessionMaxAge: { min: 60, max: 365 * 24 * 60 * 60 },
  auditLogDbRetentionDays: { min: 1, max: 90 },
  auditLogArchiveRetentionDays: { min: 1, max: 365 * 2 },
} as const

function LimitsRequestCard({ limits }: { limits: LimitsSettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<LimitsSettings, { maxRequestBodySize: number }>({
    section: 'limits',
    source: limits,
    toState: (source) => ({ maxRequestBodySize: source.maxRequestBodySize }),
    fromState: (state) => ({
      maxRequestBodySize: state.maxRequestBodySize,
    }),
  })

  return (
    <SettingGroup
      title="请求限制"
      description="控制上传文件、表单提交等场景的最大请求体大小。过大可能增加内存压力，过小则可能导致图片上传失败。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow
            label="最大请求体大小（字节）"
            htmlFor="limits-max-request-body-size"
            hint={`范围 ${BOUNDS.maxRequestBodySize.min} - ${BOUNDS.maxRequestBodySize.max}。默认 10 MB（${10 * 1024 * 1024}）。`}
          >
            <Input
              id="limits-max-request-body-size"
              type="number"
              min={BOUNDS.maxRequestBodySize.min}
              max={BOUNDS.maxRequestBodySize.max}
              {...form.register('maxRequestBodySize', { valueAsNumber: true })}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue
            label="最大请求体大小"
            value={`${display.maxRequestBodySize.toLocaleString()} 字节`}
            hint={`约 ${(display.maxRequestBodySize / (1024 * 1024)).toFixed(1)} MB`}
          />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function LimitsSessionCard({ limits }: { limits: LimitsSettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<LimitsSettings, { sessionMaxAge: number }>({
    section: 'limits',
    source: limits,
    toState: (source) => ({ sessionMaxAge: source.sessionMaxAge }),
    fromState: (state) => ({
      sessionMaxAge: state.sessionMaxAge,
    }),
  })

  return (
    <SettingGroup
      title="会话限制"
      description="管理后台与公共站点的登录会话有效期。过期后用户需要重新登录。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow
            label="会话最大有效期（秒）"
            htmlFor="limits-session-max-age"
            hint={`范围 ${BOUNDS.sessionMaxAge.min} - ${BOUNDS.sessionMaxAge.max}。默认 30 天（${60 * 60 * 24 * 30}）。`}
          >
            <Input
              id="limits-session-max-age"
              type="number"
              min={BOUNDS.sessionMaxAge.min}
              max={BOUNDS.sessionMaxAge.max}
              {...form.register('sessionMaxAge', { valueAsNumber: true })}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue
            label="会话最大有效期"
            value={`${display.sessionMaxAge.toLocaleString()} 秒`}
            hint={`约 ${Math.round(display.sessionMaxAge / (60 * 60 * 24))} 天`}
          />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function LimitsAuditCard({ limits }: { limits: LimitsSettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<
    LimitsSettings,
    { auditLogDbRetentionDays: number; auditLogArchiveRetentionDays: number }
  >({
    section: 'limits',
    source: limits,
    toState: (source) => ({
      auditLogDbRetentionDays: source.auditLogDbRetentionDays ?? 30,
      auditLogArchiveRetentionDays: source.auditLogArchiveRetentionDays ?? 180,
    }),
    fromState: (state) => ({
      auditLogDbRetentionDays: state.auditLogDbRetentionDays,
      auditLogArchiveRetentionDays: state.auditLogArchiveRetentionDays,
    }),
  })

  return (
    <SettingGroup
      title="审计日志限制"
      description="控制审计日志在数据库中的保留时长，以及归档到 S3 后的保留时长。S3 未开启时，超期日志将直接删除而不归档。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow
            label="数据库保留天数"
            htmlFor="limits-audit-db-retention"
            hint={`范围 ${BOUNDS.auditLogDbRetentionDays.min} - ${BOUNDS.auditLogDbRetentionDays.max}。默认 30 天。`}
          >
            <Input
              id="limits-audit-db-retention"
              type="number"
              min={BOUNDS.auditLogDbRetentionDays.min}
              max={BOUNDS.auditLogDbRetentionDays.max}
              {...form.register('auditLogDbRetentionDays', { valueAsNumber: true })}
            />
          </SettingsRow>
          <SettingsRow
            label="S3 归档保留天数"
            htmlFor="limits-audit-archive-retention"
            hint={`范围 ${BOUNDS.auditLogArchiveRetentionDays.min} - ${BOUNDS.auditLogArchiveRetentionDays.max}。默认 180 天。`}
          >
            <Input
              id="limits-audit-archive-retention"
              type="number"
              min={BOUNDS.auditLogArchiveRetentionDays.min}
              max={BOUNDS.auditLogArchiveRetentionDays.max}
              {...form.register('auditLogArchiveRetentionDays', { valueAsNumber: true })}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue
            label="数据库保留天数"
            value={`${display.auditLogDbRetentionDays ?? 30} 天`}
            hint="超期后将归档到 S3；S3 未开启时直接删除。"
          />
          <SettingValue
            label="S3 归档保留天数"
            value={`${display.auditLogArchiveRetentionDays ?? 180} 天`}
            hint="S3 上的 gzip 归档文件保留时长。"
          />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

export function LimitsForm({ limits }: LimitsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <LimitsRequestCard limits={limits} />
      <LimitsSessionCard limits={limits} />
      <LimitsAuditCard limits={limits} />
    </div>
  )
}
