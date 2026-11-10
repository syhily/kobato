import { Controller, useWatch, type UseFormReturn } from 'react-hook-form'

import type { ObservabilitySettings } from '@/shared/config/types'
import type { ObservabilityStatusOutput } from '@/shared/contracts/observability'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { useI18n } from '@/ui/lib/I18nProvider'

interface ReportingFormState {
  enabled: boolean
  logsEnabled: boolean
  frontendEnabled: boolean
  sessionSampleRate: number
  sampleRate: number
  includeRedactedSql: boolean
}

const PHASE_MESSAGE_IDS = {
  disabled: 'admin.settings.observability.reporting.phase.disabled',
  unverified: 'admin.settings.observability.reporting.phase.unverified',
  invalid: 'admin.settings.observability.reporting.phase.invalid',
  running: 'admin.settings.observability.reporting.phase.running',
  failed: 'admin.settings.observability.reporting.phase.failed',
} as const satisfies Record<ObservabilityStatusOutput['runtime']['phase'], UiMessageId>

function ToggleRow({
  form,
  save,
  disabled,
  name,
  id,
  label,
  hint,
}: {
  form: UseFormReturn<ReportingFormState>
  save: (field?: string) => unknown
  disabled: boolean
  name: 'enabled' | 'logsEnabled' | 'frontendEnabled' | 'includeRedactedSql'
  id: string
  label: string
  hint: string
}) {
  const { t } = useI18n()
  return (
    <SettingsRow label={label} hint={hint}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <div className="flex items-center gap-3">
            <SettingsSwitch
              name={field.name}
              id={id}
              checked={field.value}
              onCheckedChange={field.onChange}
              save={save}
              disabled={disabled}
            />
            <FieldLabel htmlFor={id} className="font-normal">
              {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
            </FieldLabel>
          </div>
        )}
      />
    </SettingsRow>
  )
}

function RateInput({
  form,
  flushOnBlur,
  disabled,
  id,
  name,
  min,
  max,
  step,
}: {
  form: UseFormReturn<ReportingFormState>
  flushOnBlur: () => void
  disabled: boolean
  id: string
  name: 'sampleRate' | 'sessionSampleRate'
  min: number
  max: number
  step: number
}) {
  return (
    <SettingsInput
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      flushOnBlur={flushOnBlur}
      {...form.register(name, { setValueAs: (value: unknown) => (value === '' ? min : Number(value)) })}
    />
  )
}

interface ObservabilityReportingCardProps {
  observability: ObservabilitySettings
  status: ObservabilityStatusOutput | undefined
  onStatusInvalidated: () => void
}

export function ObservabilityReportingCard({
  observability,
  status,
  onStatusInvalidated,
}: ObservabilityReportingCardProps) {
  const { t } = useI18n()
  const { form, flushOnBlur, save, settingGroupProps } = useSettingsCard<ObservabilitySettings, ReportingFormState>({
    section: 'observability',
    source: observability,
    toState: (source) => ({
      enabled: source.observability.enabled,
      logsEnabled: source.observability.logs.enabled,
      frontendEnabled: source.observability.frontend.enabled,
      sessionSampleRate: source.observability.frontend.sessionSampleRate,
      sampleRate: source.observability.sampleRate,
      includeRedactedSql: source.observability.includeRedactedSql,
    }),
    fromState: (state) => ({
      observability: {
        enabled: state.enabled,
        sampleRate: state.sampleRate,
        includeRedactedSql: state.includeRedactedSql,
        logs: { enabled: state.logsEnabled },
        frontend: {
          enabled: state.frontendEnabled,
          sessionSampleRate: state.sessionSampleRate,
        },
      },
    }),
    // Toggle changes restart the runtime — refresh the phase/lastError projection.
    onSaved: onStatusInvalidated,
  })

  const frontendEnabled = useWatch({ control: form.control, name: 'frontendEnabled' })
  const gated = status?.verified !== true
  const runtimePhase = status === undefined ? null : status.runtime.phase

  return (
    <SettingGroup
      title={t('admin.settings.observability.reporting.title')}
      description={t('admin.settings.observability.reporting.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        {gated ? (
          <p className="text-sm text-status-warn-fg" role="status">
            {t('admin.settings.observability.reporting.gate')}
          </p>
        ) : null}

        <SettingsRow label={t('admin.settings.observability.reporting.runtime')}>
          <p className="text-sm text-muted-foreground">
            {runtimePhase === null
              ? t('admin.settings.observability.reporting.phase.loading')
              : t(PHASE_MESSAGE_IDS[runtimePhase])}
          </p>
        </SettingsRow>

        <ToggleRow
          form={form}
          save={save}
          disabled={gated}
          name="enabled"
          id="observability-enabled"
          label={t('admin.settings.observability.reporting.enabled')}
          hint={t('admin.settings.observability.reporting.enabledHint')}
        />
        <ToggleRow
          form={form}
          save={save}
          disabled={gated}
          name="logsEnabled"
          id="observability-logs-enabled"
          label={t('admin.settings.observability.reporting.logs')}
          hint={t('admin.settings.observability.reporting.logsHint')}
        />
        <ToggleRow
          form={form}
          save={save}
          disabled={gated}
          name="frontendEnabled"
          id="observability-frontend-enabled"
          label={t('admin.settings.observability.reporting.frontend')}
          hint={t('admin.settings.observability.reporting.frontendHint')}
        />
        <SettingsRow
          label={t('admin.settings.observability.reporting.sessionSampleRate')}
          htmlFor="observability-session-sample-rate"
          hint={t('admin.settings.observability.reporting.sessionSampleRateHint')}
        >
          <RateInput
            form={form}
            flushOnBlur={flushOnBlur}
            disabled={gated || !frontendEnabled}
            id="observability-session-sample-rate"
            name="sessionSampleRate"
            min={0}
            max={100}
            step={1}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.observability.reporting.sampleRate')}
          htmlFor="observability-sample-rate"
          hint={t('admin.settings.observability.reporting.sampleRateHint')}
        >
          <RateInput
            form={form}
            flushOnBlur={flushOnBlur}
            disabled={gated}
            id="observability-sample-rate"
            name="sampleRate"
            min={0}
            max={1}
            step={0.01}
          />
        </SettingsRow>
        <ToggleRow
          form={form}
          save={save}
          disabled={gated}
          name="includeRedactedSql"
          id="observability-include-redacted-sql"
          label={t('admin.settings.observability.reporting.includeRedactedSql')}
          hint={t('admin.settings.observability.reporting.includeRedactedSqlHint')}
        />

        {status !== undefined && status.runtime.lastError !== null ? (
          <SettingsRow
            label={t('admin.settings.observability.reporting.lastError')}
            hint={t('admin.settings.observability.reporting.lastErrorHint')}
          >
            <code className="block w-full overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-all select-all">
              {status.runtime.lastError}
            </code>
          </SettingsRow>
        ) : null}
      </SettingGroupContent>
    </SettingGroup>
  )
}
