import type { LimitsSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { useI18n } from '@/ui/lib/I18nProvider'

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
  const { t } = useI18n()
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<LimitsSettings, { maxRequestBodySize: number }>({
    section: 'limits',
    source: limits,
    toState: (source) => ({ maxRequestBodySize: source.maxRequestBodySize }),
    fromState: (state) => ({
      maxRequestBodySize: state.maxRequestBodySize,
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.limits.request.title')}
      description={t('admin.settings.limits.request.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.limits.request.maxBody')}
          htmlFor="limits-max-request-body-size"
          hint={t('admin.settings.limits.request.maxBodyHint', {
            min: BOUNDS.maxRequestBodySize.min,
            max: BOUNDS.maxRequestBodySize.max,
            bytes: 10 * 1024 * 1024,
          })}
        >
          <SettingsInput
            id="limits-max-request-body-size"
            type="number"
            min={BOUNDS.maxRequestBodySize.min}
            max={BOUNDS.maxRequestBodySize.max}
            flushOnBlur={flushOnBlur}
            {...form.register('maxRequestBodySize', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function LimitsSessionCard({ limits }: { limits: LimitsSettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<LimitsSettings, { sessionMaxAge: number }>({
    section: 'limits',
    source: limits,
    toState: (source) => ({ sessionMaxAge: source.sessionMaxAge }),
    fromState: (state) => ({
      sessionMaxAge: state.sessionMaxAge,
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.limits.session.title')}
      description={t('admin.settings.limits.session.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.limits.session.maxAge')}
          htmlFor="limits-session-max-age"
          hint={t('admin.settings.limits.session.maxAgeHint', {
            min: BOUNDS.sessionMaxAge.min,
            max: BOUNDS.sessionMaxAge.max,
            seconds: 60 * 60 * 24 * 30,
          })}
        >
          <SettingsInput
            id="limits-session-max-age"
            type="number"
            min={BOUNDS.sessionMaxAge.min}
            max={BOUNDS.sessionMaxAge.max}
            flushOnBlur={flushOnBlur}
            {...form.register('sessionMaxAge', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function LimitsAuditCard({ limits }: { limits: LimitsSettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<
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
      title={t('admin.settings.limits.audit.title')}
      description={t('admin.settings.limits.audit.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.limits.audit.dbDays')}
          htmlFor="limits-audit-db-retention"
          hint={t('admin.settings.limits.audit.dbDaysHint', {
            min: BOUNDS.auditLogDbRetentionDays.min,
            max: BOUNDS.auditLogDbRetentionDays.max,
          })}
        >
          <SettingsInput
            id="limits-audit-db-retention"
            type="number"
            min={BOUNDS.auditLogDbRetentionDays.min}
            max={BOUNDS.auditLogDbRetentionDays.max}
            flushOnBlur={flushOnBlur}
            {...form.register('auditLogDbRetentionDays', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.limits.audit.archiveDays')}
          htmlFor="limits-audit-archive-retention"
          hint={t('admin.settings.limits.audit.archiveDaysHint', {
            min: BOUNDS.auditLogArchiveRetentionDays.min,
            max: BOUNDS.auditLogArchiveRetentionDays.max,
          })}
        >
          <SettingsInput
            id="limits-audit-archive-retention"
            type="number"
            min={BOUNDS.auditLogArchiveRetentionDays.min}
            max={BOUNDS.auditLogArchiveRetentionDays.max}
            flushOnBlur={flushOnBlur}
            {...form.register('auditLogArchiveRetentionDays', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
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
