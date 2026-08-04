import type { BackupSettings } from '@kobato/shared/config/types'

import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@kobato/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@kobato/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@kobato/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select'
import { Controller, useWatch } from 'react-hook-form'

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

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 30] as const

function asBackupMinute(value: string | null): BackupSettings['scheduled']['minute'] {
  return value === '30' ? 30 : 0
}

interface BackupScheduleFormProps {
  backup: BackupSettings
  canConfigure: boolean
}

export function BackupScheduleForm({ backup, canConfigure }: BackupScheduleFormProps) {
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

  return (
    <SettingGroup title="定时备份" description="配置自动备份的频率与保留策略。" {...settingGroupProps}>
      <SettingGroupContent>
        <SettingsRow label="启用定时备份">
          <Controller
            control={form.control}
            name="scheduledEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="scheduled-enabled"
                  checked={field.value}
                  disabled={!canConfigure}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="scheduled-enabled" className="font-normal">
                  开启
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>

        {enabled && (
          <>
            <SettingsRow label="备份频率">
              <Controller
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <SettingsSelect
                    name={field.name}
                    value={field.value}
                    onValueChange={field.onChange}
                    save={save}
                    disabled={!canConfigure}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">每天</SelectItem>
                      <SelectItem value="weekly">每周</SelectItem>
                      <SelectItem value="monthly">每月</SelectItem>
                    </SelectContent>
                  </SettingsSelect>
                )}
              />
            </SettingsRow>

            <SettingsRow label="备份时间">
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
                      disabled={!canConfigure}
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
                      disabled={!canConfigure}
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
              <SettingsRow label="星期">
                <Controller
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <SettingsSelect
                      name={field.name}
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => field.onChange(Number(v))}
                      save={save}
                      disabled={!canConfigure}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_LABELS.map((label, idx) => (
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
              <SettingsRow label="每月日期">
                <Controller
                  control={form.control}
                  name="dayOfMonth"
                  render={({ field }) => (
                    <SettingsSelect
                      name={field.name}
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => field.onChange(Number(v))}
                      save={save}
                      disabled={!canConfigure}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} 日
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SettingsSelect>
                  )}
                />
              </SettingsRow>
            )}

            <SettingsRow label="保留策略">
              <Controller
                control={form.control}
                name="retentionEnabled"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <SettingsSwitch
                      name={field.name}
                      id="retention-enabled"
                      checked={field.value}
                      disabled={!canConfigure}
                      onCheckedChange={field.onChange}
                      save={save}
                    />
                    <FieldLabel htmlFor="retention-enabled" className="font-normal">
                      自动清理历史备份
                    </FieldLabel>
                  </div>
                )}
              />
            </SettingsRow>

            {retentionEnabled && (
              <SettingsRow label="保留天数" hint="超过此天数的旧备份将被自动删除。">
                <SettingsInput
                  flushOnBlur={flushOnBlur}
                  type="number"
                  min={1}
                  max={365}
                  disabled={!canConfigure}
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
