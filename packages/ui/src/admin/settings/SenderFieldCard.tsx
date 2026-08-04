import type { MailLoaderShape } from '@kobato/shared/config/projection'

import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'

export function SenderFieldCard({ mail }: { mail: MailLoaderShape }) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<MailLoaderShape, { sender: string }>({
    section: 'mail',
    source: mail,
    toState: (source) => ({ sender: source.mail.sender }),
    fromState: (state) => ({
      mail: { sender: state.sender.trim() },
    }),
  })

  return (
    <SettingGroup
      title="发件人邮箱"
      description="收件人看到的 From 地址。对所有服务商通用，独立保存，不会因切换提供商而丢失。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="发件人邮箱" htmlFor="mail-sender" hint="必须是当前服务商已验证过的发件域。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-sender"
            type="email"
            placeholder="noreply@example.com"
            maxLength={253}
            {...form.register('sender')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
