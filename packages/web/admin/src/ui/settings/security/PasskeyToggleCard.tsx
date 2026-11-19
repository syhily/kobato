import type { SecuritySettings } from '@kobato/settings/types.ts'

import { isValidPasskeyDomain } from '@kobato/auth/network.ts'
import { FieldLabel } from '@kobato/ui/components/field.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsSwitch } from '@kobato/web-admin/ui/settings/shell/SettingsSwitch.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'
import { useSiteIdentity } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { Controller } from 'react-hook-form'

export function PasskeyToggleCard({ security }: { security: SecuritySettings }) {
  const { t } = useI18n()
  const siteIdentity = useSiteIdentity()
  const website = siteIdentity?.website ?? ''
  const domainValid = isValidPasskeyDomain(website)

  const { form, settingGroupProps, save } = useSettingsCard<SecuritySettings, { enabled: boolean }>({
    section: 'security',
    source: security,
    toState: (source) => ({ enabled: source.passkey?.enabled ?? false }),
    fromState: (state) => ({
      passkey: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.security.passkey.title')}
      description={t('admin.settings.security.passkey.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.security.passkey.enable')}
          hint={
            domainValid
              ? t('admin.settings.security.passkey.enableHint')
              : t('admin.settings.security.passkey.requireDomain')
          }
        >
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="passkey-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                  disabled={!domainValid && !field.value}
                />
                <FieldLabel htmlFor="passkey-enabled" className="font-normal">
                  {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
        {!domainValid && (
          <p className="text-sm text-muted-foreground">{t('admin.settings.security.passkey.domainWarning')}</p>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}
