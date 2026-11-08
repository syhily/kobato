import { Controller } from 'react-hook-form'

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
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { useI18n } from '@/ui/lib/I18nProvider'

export function SmtpConfigCard({ mail }: { mail: MailLoaderShape }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, display, save } = useSettingsCard<
    MailLoaderShape,
    {
      smtpHost: string
      smtpPort: number
      smtpUser: string
      smtpPass: string
      smtpSecure: boolean
      smtpRequireTls: boolean
      smtpRejectUnauthorized: boolean
    }
  >({
    section: 'mail',
    source: mail,
    toState: (source) => ({
      smtpHost: source.mail.smtpHost,
      smtpPort: source.mail.smtpPort,
      smtpUser: source.mail.smtpUser,
      smtpPass: '',
      smtpSecure: source.mail.smtpSecure,
      smtpRequireTls: source.mail.smtpRequireTls,
      smtpRejectUnauthorized: source.mail.smtpRejectUnauthorized,
    }),
    fromState: (state) => ({
      mail: {
        smtpHost: state.smtpHost.trim(),
        smtpPort: Number.isFinite(state.smtpPort) ? state.smtpPort : 587,
        smtpUser: state.smtpUser.trim(),
        smtpSecure: state.smtpSecure,
        smtpRequireTls: state.smtpRequireTls,
        smtpRejectUnauthorized: state.smtpRejectUnauthorized,
        ...secretFieldPatch(state.smtpPass, 'smtpPass'),
      },
    }),
  })

  const smtpPassField = secretFieldStrings({
    t,
    mask: display.mail.smtpPassMask,
    keepLabel: t('admin.settings.mail.smtp.keepPass'),
    emptyHint: t('admin.settings.mail.smtp.passHintEmpty'),
    emptyPlaceholder: t('admin.settings.mail.smtp.passPlaceholder'),
  })
  return (
    <SettingGroup
      title={t('admin.settings.mail.smtp.title')}
      description={t('admin.settings.mail.smtp.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.mail.smtp.host')}
          htmlFor="mail-smtp-host"
          hint={t('admin.settings.mail.smtp.hostHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-host"
            placeholder={t('admin.settings.mail.smtp.hostPlaceholder')}
            maxLength={253}
            {...form.register('smtpHost')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.mail.smtp.port')}
          htmlFor="mail-smtp-port"
          hint={t('admin.settings.mail.smtp.portHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-port"
            type="number"
            min={1}
            max={65535}
            {...form.register('smtpPort', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.mail.smtp.user')}
          htmlFor="mail-smtp-user"
          hint={t('admin.settings.mail.smtp.userHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-user"
            type="text"
            placeholder={t('admin.settings.mail.smtp.userPlaceholder')}
            maxLength={512}
            {...form.register('smtpUser')}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.mail.smtp.pass')} htmlFor="mail-smtp-pass" hint={smtpPassField.hint}>
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="mail-smtp-pass"
            placeholder={smtpPassField.placeholder}
            {...form.register('smtpPass')}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.mail.smtp.secure')} hint={t('admin.settings.mail.smtp.secureHint')}>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpSecure"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-smtp-secure"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-secure" className="font-normal">
              {t('admin.settings.mail.smtp.secureLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.mail.smtp.requireTls')}
          hint={t('admin.settings.mail.smtp.requireTlsHint')}
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpRequireTls"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-smtp-require-tls"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-require-tls" className="font-normal">
              {t('admin.settings.mail.smtp.requireTlsLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow label={t('admin.settings.mail.smtp.verify')} hint={t('admin.settings.mail.smtp.verifyHint')}>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="smtpRejectUnauthorized"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="mail-smtp-reject-unauthorized"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="mail-smtp-reject-unauthorized" className="font-normal">
              {t('admin.settings.mail.smtp.verifyLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
