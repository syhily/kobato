import type { MailLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@/ui/admin/settings/shell/SettingsSecretInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { useI18n } from '@/ui/lib/I18nProvider'

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
