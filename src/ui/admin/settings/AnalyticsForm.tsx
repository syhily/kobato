import { Controller } from 'react-hook-form'

import type { AnalyticsSettings } from '@/shared/config/blog'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { Switch } from '@/ui/components/switch'

interface AnalyticsFormProps {
  analytics: AnalyticsSettings
}

export function AnalyticsForm({ analytics }: AnalyticsFormProps) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<
    AnalyticsSettings,
    { trackAdmin: boolean; keepBotRows: boolean }
  >({
    section: 'analytics',
    source: analytics,
    toState: (source) => ({
      trackAdmin: source.analytics.trackAdmin,
      keepBotRows: source.analytics.keepBotRows,
    }),
    fromState: (state) => ({
      analytics: { trackAdmin: state.trackAdmin, keepBotRows: state.keepBotRows },
    }),
  })

  return (
    <div className="flex flex-col gap-5">
      <SettingGroup title="采集策略" description="控制管理员访问是否被记录到访问日志中。" {...settingGroupProps}>
        {mode === 'edit' ? (
          <SettingGroupContent>
            <SettingsRow label="记录管理员访问" hint="关闭时，管理员浏览首页和文章不会被写入 access_log。">
              <Controller
                control={form.control}
                name="trackAdmin"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Switch id="analytics-track-admin" checked={field.value} onCheckedChange={field.onChange} />
                    <FieldLabel htmlFor="analytics-track-admin" className="font-normal">
                      {field.value ? '已开启' : '已关闭'}
                    </FieldLabel>
                  </div>
                )}
              />
            </SettingsRow>
          </SettingGroupContent>
        ) : (
          <SettingGroupContent>
            <SettingValue label="记录管理员访问" value={display.analytics.trackAdmin ? '已开启' : '已关闭'} />
          </SettingGroupContent>
        )}
      </SettingGroup>

      <SettingGroup title="过滤策略" description="控制是否保留爬虫和机器人的访问记录。" {...settingGroupProps}>
        {mode === 'edit' ? (
          <SettingGroupContent>
            <SettingsRow label="保留爬虫记录" hint="默认会过滤机器人请求；开启后保留用于调试。">
              <Controller
                control={form.control}
                name="keepBotRows"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Switch id="analytics-keep-bot-rows" checked={field.value} onCheckedChange={field.onChange} />
                    <FieldLabel htmlFor="analytics-keep-bot-rows" className="font-normal">
                      {field.value ? '已开启' : '已关闭'}
                    </FieldLabel>
                  </div>
                )}
              />
            </SettingsRow>
          </SettingGroupContent>
        ) : (
          <SettingGroupContent>
            <SettingValue label="保留爬虫记录" value={display.analytics.keepBotRows ? '已开启' : '已关闭'} />
          </SettingGroupContent>
        )}
      </SettingGroup>
    </div>
  )
}
