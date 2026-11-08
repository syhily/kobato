import { Controller } from 'react-hook-form'

import type { MailLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { useI18n } from '@/ui/lib/I18nProvider'

export function MailToggleCard({ mail }: { mail: MailLoaderShape }) {
  const { t } = useI18n()
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
      title={t('admin.settings.mail.toggle.title')}
      description={t('admin.settings.mail.toggle.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.mail.toggle.enable')} hint={t('admin.settings.mail.toggle.enableHint')}>
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
              {t('admin.settings.mail.toggle.enableLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.mail.toggle.notifications')}
          hint={t('admin.settings.mail.toggle.notificationsHint')}
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
              {t('admin.settings.mail.toggle.notificationsLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
