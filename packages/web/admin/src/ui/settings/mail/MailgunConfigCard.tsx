import type { MailLoaderShape } from '@kobato/settings/projection'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@kobato/web-admin/ui/settings/shell/SettingsSecretInput'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'

export function MailgunConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, display } = useSettingsCard<
    MailLoaderShape,
    { mailgunDomain: string; mailgunApiKey: string }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      mailgunDomain: source.mail.mailgunDomain,
      mailgunApiKey: '',
    }),
    fromState: (state) => ({
      mail: {
        mailgunDomain: state.mailgunDomain.trim(),
        ...secretFieldPatch(state.mailgunApiKey, 'mailgunApiKey'),
      },
    }),
  })

  const mailgunApiKeyField = secretFieldStrings({
    t,
    mask: display.mail.mailgunApiKeyMask,
    keepLabel: t('admin.settings.mail.mailgun.keepKey'),
    emptyHint: t('admin.settings.mail.mailgun.keyHintEmpty'),
    emptyPlaceholder: t('admin.settings.mail.mailgun.keyPlaceholder'),
  })
  return (
    <SettingGroup
      title={t('admin.settings.mail.mailgun.title')}
      description={t('admin.settings.mail.mailgun.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.mail.mailgun.domain')}
          htmlFor="mail-mailgun-domain"
          hint={t('admin.settings.mail.mailgun.domainHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-mailgun-domain"
            placeholder={t('admin.settings.mail.mailgun.domainPlaceholder')}
            maxLength={253}
            {...form.register('mailgunDomain')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.mail.mailgun.apiKey')}
          htmlFor="mail-mailgun-api-key"
          hint={mailgunApiKeyField.hint}
        >
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="mail-mailgun-api-key"
            placeholder={mailgunApiKeyField.placeholder}
            {...form.register('mailgunApiKey')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
