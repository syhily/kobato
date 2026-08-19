import { Controller, useWatch } from 'react-hook-form'

import type { BackupSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

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
const FREQUENCY_OPTIONS = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
] as const

function asBackupMinute(value: string | null): BackupSettings['scheduled']['minute'] {
  return value === '30' ? 30 : 0
}

interface BackupScheduleFormProps {
  backup: BackupSettings
}

export function BackupScheduleForm({ backup }: BackupScheduleFormProps) {
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
                    items={FREQUENCY_OPTIONS}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
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
                      items={WEEKDAY_LABELS.map((label, idx) => ({ value: String(idx + 1), label }))}
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
                      items={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} 日` }))}
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
