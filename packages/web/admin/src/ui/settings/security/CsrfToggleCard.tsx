import type { SecuritySettings } from '@kobato/settings/types.ts'

import { FieldLabel } from '@kobato/ui/components/field.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsSwitch } from '@kobato/web-admin/ui/settings/shell/SettingsSwitch.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'
import { Controller } from 'react-hook-form'

export function CsrfToggleCard({ security }: { security: SecuritySettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, save } = useSettingsCard<SecuritySettings, { enabled: boolean }>({
    section: 'security',
    source: security,
    toState: (source) => ({ enabled: source.csrf.enabled }),
    fromState: (state) => ({
      csrf: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.security.csrf.title')}
      description={t('admin.settings.security.csrf.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.security.csrf.enable')}
          hint={t('admin.settings.security.csrf.enableHint')}
        >
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="csrf-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="csrf-enabled" className="font-normal">
                  {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
