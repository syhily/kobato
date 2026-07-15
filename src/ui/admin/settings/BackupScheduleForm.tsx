import { Controller, useWatch } from 'react-hook-form'

import type { BackupSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Switch } from '@/ui/components/switch'

interface FormState {
  scheduledEnabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  hour: number
  minute: number
  dayOfWeek?: number
  dayOfMonth?: number
  retentionEnabled: boolean
  retentionDays: number
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 30]

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
                <Switch
                  id="scheduled-enabled"
                  checked={field.value}
                  disabled={!canConfigure}
                  onCheckedChange={(val) => {
                    field.onChange(val)
                    save()
                  }}
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
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v)
                      save()
                    }}
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
                  </Select>
                )}
              />
            </SettingsRow>

            <SettingsRow label="备份时间">
              <div className="flex gap-2">
                <Controller
                  control={form.control}
                  name="hour"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => {
                        field.onChange(Number(v))
                        save()
                      }}
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
                    </Select>
                  )}
                />
                <span className="flex items-center text-muted-foreground">:</span>
                <Controller
                  control={form.control}
                  name="minute"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => {
                        field.onChange(Number(v))
                        save()
                      }}
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
                    </Select>
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
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => {
                        field.onChange(Number(v))
                        save()
                      }}
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
                    </Select>
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
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => {
                        field.onChange(Number(v))
                        save()
                      }}
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
                    </Select>
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
                    <Switch
                      id="retention-enabled"
                      checked={field.value}
                      disabled={!canConfigure}
                      onCheckedChange={(val) => {
                        field.onChange(val)
                        save()
                      }}
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
