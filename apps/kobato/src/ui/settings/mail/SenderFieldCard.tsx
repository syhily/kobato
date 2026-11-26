import type { MailLoaderShape } from '@kobato/settings/projection'

import { useI18n } from '@kobato/ui/lib/I18nProvider'

import { SettingsRow } from '@/ui/settings/SettingsSection'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'

export function SenderFieldCard({ mail }: { mail: MailLoaderShape }) {
  const { t } = useI18n()
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
      title={t('admin.settings.mail.sender.title')}
      description={t('admin.settings.mail.sender.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.mail.sender.label')}
          htmlFor="mail-sender"
          hint={t('admin.settings.mail.sender.hint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-sender"
            type="email"
            placeholder={t('admin.settings.mail.sender.placeholder')}
            maxLength={253}
            {...form.register('sender')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
