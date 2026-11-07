import { Controller } from 'react-hook-form'

import type { MailLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'

export function MailToggleCard({ mail }: { mail: MailLoaderShape }) {
  const { form, settingGroupProps, save } = useSettingsCard<
    MailLoaderShape,
    { enabled: boolean; notificationEmails: boolean }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      enabled: source.mail.enabled,
      notificationEmails: source.mail.notificationEmails,
    }),
    fromState: (state) => ({
      mail: { enabled: state.enabled, notificationEmails: state.notificationEmails },
    }),
  })

  return (
    <SettingGroup
      title="邮件发送总开关"
      description="关闭后，所有评论通知 / 回复通知 / 审核通过通知 / 通知邮件都不会再发送（不会报错，仅记录 debug 日志）。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="启用邮件发送" hint="生产环境推荐先用「测试发送」确认连接，再打开此开关。">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-enabled" className="font-normal">
              发送通知邮件
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow
          label="通知邮件"
          hint="私信与系统提醒同时发送邮件。邮件服务启用后默认开启；关闭后这些消息仅站内可见。"
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="notificationEmails"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-notification-emails"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-notification-emails" className="font-normal">
              私信与系统提醒发送邮件
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
