import type { MailLoaderShape } from '@kobato/settings/projection.ts'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { SettingsRow } from '@kobato/web/ui/admin/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web/ui/admin/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web/ui/admin/settings/shell/SettingGroupContent.tsx'
import { SettingsInput } from '@kobato/web/ui/admin/settings/shell/SettingsInput.tsx'
import { useSettingsCard } from '@kobato/web/ui/admin/settings/shell/useSettingsCard.tsx'

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
