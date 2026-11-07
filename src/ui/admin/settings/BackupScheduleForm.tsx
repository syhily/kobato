import { Controller, useWatch } from 'react-hook-form'

import type { BackupSettings } from '@/shared/config/types'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { useI18n } from '@/ui/lib/I18nProvider'

interface FormState {
  scheduledEnabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  hour: number
  minute: BackupSettings['scheduled']['minute']
  dayOfWeek?: number
  dayOfMonth?: number
  retentionEnabled: boolean
  retentionDays: number
}

const WEEKDAY_LABEL_IDS: readonly UiMessageId[] = [
  'admin.settings.backup.schedule.weekday.mon',
  'admin.settings.backup.schedule.weekday.tue',
  'admin.settings.backup.schedule.weekday.wed',
  'admin.settings.backup.schedule.weekday.thu',
  'admin.settings.backup.schedule.weekday.fri',
  'admin.settings.backup.schedule.weekday.sat',
  'admin.settings.backup.schedule.weekday.sun',
]
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 30] as const
const FREQUENCY_OPTIONS: readonly { value: 'daily' | 'weekly' | 'monthly'; labelId: UiMessageId }[] = [
  { value: 'daily', labelId: 'admin.settings.backup.schedule.frequency.daily' },
  { value: 'weekly', labelId: 'admin.settings.backup.schedule.frequency.weekly' },
  { value: 'monthly', labelId: 'admin.settings.backup.schedule.frequency.monthly' },
]

function asBackupMinute(value: string | null): BackupSettings['scheduled']['minute'] {
  return value === '30' ? 30 : 0
}

interface BackupScheduleFormProps {
  backup: BackupSettings
}

export function BackupScheduleForm({ backup }: BackupScheduleFormProps) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, save } = useSettingsCard<BackupSettings, FormState>({
    section: 'backup',
    source: backup,
    toState: (source) => ({
      scheduledEnabled: source.scheduled.enabled,
      frequency: source.scheduled.frequency,
      hour: source.scheduled.hour,
      minute: source.scheduled.minute,
      dayOfWeek: source.scheduled.dayOfWeek,
      dayOfMonth: source.scheduled.dayOfMonth,
      retentionEnabled: source.retention.enabled,
      retentionDays: source.retention.days,
    }),
    fromState: (state) => ({
      scheduled: {
        enabled: state.scheduledEnabled,
        frequency: state.frequency,
        hour: state.hour,
        minute: state.minute,
        dayOfWeek: state.frequency === 'weekly' ? state.dayOfWeek : undefined,
        dayOfMonth: state.frequency === 'monthly' ? state.dayOfMonth : undefined,
      },
      retention: {
        enabled: state.retentionEnabled,
        days: state.retentionDays,
      },
    }),
  })

  const enabled = useWatch({ control: form.control, name: 'scheduledEnabled' })
  const frequency = useWatch({ control: form.control, name: 'frequency' })
  const retentionEnabled = useWatch({ control: form.control, name: 'retentionEnabled' })

  const frequencyOptions = FREQUENCY_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelId) }))
  const weekdayLabels = WEEKDAY_LABEL_IDS.map((id) => t(id))
  const dayOfMonthOptions = Array.from({ length: 28 }, (_, i) => ({
    value: String(i + 1),
    label: t('admin.settings.backup.schedule.dayOfMonthOption', { day: i + 1 }),
  }))

  return (
    <SettingGroup
      title={t('admin.settings.backup.schedule.title')}
      description={t('admin.settings.backup.schedule.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.backup.schedule.enable')}>
          <Controller
            control={form.control}
            name="scheduledEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="scheduled-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="scheduled-enabled" className="font-normal">
                  {t('admin.settings.shared.toggle.on')}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>

        {enabled && (
          <>
            <SettingsRow label={t('admin.settings.backup.schedule.frequency')}>
              <Controller
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <SettingsSelect
                    name={field.name}
                    value={field.value}
                    onValueChange={field.onChange}
                    save={save}
                    items={frequencyOptions}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SettingsSelect>
                )}
              />
            </SettingsRow>

            <SettingsRow label={t('admin.settings.backup.schedule.time')}>
              <div className="flex gap-2">
                <Controller
                  control={form.control}
                  name="hour"
                  render={({ field }) => (
                    <SettingsSelect
                      name={field.name}
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      save={save}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {String(h).padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SettingsSelect>
                  )}
                />
                <span className="flex items-center text-muted-foreground">:</span>
                <Controller
                  control={form.control}
                  name="minute"
                  render={({ field }) => (
                    <SettingsSelect
                      name={field.name}
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(asBackupMinute(v))}
                      save={save}
                      items={MINUTES.map((m) => ({ value: String(m), label: String(m).padStart(2, '0') }))}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTES.map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {String(m).padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SettingsSelect>
                  )}
                />
              </div>
            </SettingsRow>

            {frequency === 'weekly' && (
              <SettingsRow label={t('admin.settings.backup.schedule.weekday')}>
                <Controller
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <SettingsSelect
                      name={field.name}
                      value={String(field.value ?? 1)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      save={save}
                      items={weekdayLabels.map((label, idx) => ({ value: String(idx + 1), label }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {weekdayLabels.map((label, idx) => (
                          <SelectItem key={label} value={String(idx + 1)}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SettingsSelect>
                  )}
                />
              </SettingsRow>
            )}

            {frequency === 'monthly' && (
              <SettingsRow label={t('admin.settings.backup.schedule.dayOfMonth')}>
                <Controller
                  control={form.control}
                  name="dayOfMonth"
                  render={({ field }) => (
                    <SettingsSelect
                      name={field.name}
                      value={String(field.value ?? 1)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      save={save}
                      items={dayOfMonthOptions}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dayOfMonthOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SettingsSelect>
                  )}
                />
              </SettingsRow>
            )}

            <SettingsRow label={t('admin.settings.backup.schedule.retention')}>
              <Controller
                control={form.control}
                name="retentionEnabled"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <SettingsSwitch
                      name={field.name}
                      id="retention-enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      save={save}
                    />
                    <FieldLabel htmlFor="retention-enabled" className="font-normal">
                      {t('admin.settings.backup.schedule.retentionToggle')}
                    </FieldLabel>
                  </div>
                )}
              />
            </SettingsRow>

            {retentionEnabled && (
              <SettingsRow
                label={t('admin.settings.backup.schedule.retentionDays')}
                hint={t('admin.settings.backup.schedule.retentionDaysHint')}
              >
                <SettingsInput
                  flushOnBlur={flushOnBlur}
                  type="number"
                  min={1}
                  max={365}
                  {...form.register('retentionDays', { valueAsNumber: true })}
                />
              </SettingsRow>
            )}
          </>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}
