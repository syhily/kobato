import type { SiteIdentitySettings } from '@kobato/settings/types'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import {
  generalFormSchema,
  toFormValues,
  type GeneralFormValues,
} from '@kobato/web-admin/ui/settings/general/form-schema'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'

export function GeneralFooterCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
    section: 'general',
    source: siteIdentity,
    schema: generalFormSchema,
    toState: toFormValues,
    fromState: (values) => ({
      initialYear: values.initialYear,
      icpNo: values.icpNo,
      moeIcpNo: values.moeIcpNo,
    }),
  })

  const { formState } = form

  return (
    <SettingGroup
      title={t('admin.settings.general.footer.title')}
      description={t('admin.settings.general.footer.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.general.footer.initialYear')}
          htmlFor="general-initial-year"
          error={formState.errors.initialYear?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-initial-year"
            type="number"
            min={1970}
            max={9999}
            {...form.register('initialYear', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.footer.icp')}
          htmlFor="general-icp"
          error={formState.errors.icpNo?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-icp"
            maxLength={60}
            placeholder={t('admin.settings.general.footer.icpPlaceholder')}
            {...form.register('icpNo')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.footer.moeIcp')}
          htmlFor="general-moe-icp"
          error={formState.errors.moeIcpNo?.message}
        >
          <SettingsInput flushOnBlur={flushOnBlur} id="general-moe-icp" maxLength={60} {...form.register('moeIcpNo')} />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
