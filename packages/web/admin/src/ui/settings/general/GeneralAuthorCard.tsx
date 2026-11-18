import type { SiteIdentitySettings } from '@kobato/settings/types.ts'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import {
  generalFormSchema,
  toFormValues,
  type GeneralFormValues,
} from '@kobato/web-admin/ui/settings/general/form-schema.ts'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'

export function GeneralAuthorCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
    section: 'general',
    source: siteIdentity,
    schema: generalFormSchema,
    toState: toFormValues,
    fromState: (values) => ({
      author: {
        name: values.author.name.trim(),
        email: values.author.email.trim(),
        url: values.author.url.trim(),
      },
    }),
  })

  const { formState } = form

  return (
    <SettingGroup
      title={t('admin.settings.general.author.title')}
      description={t('admin.settings.general.author.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.general.author.name')}
          htmlFor="general-author-name"
          error={formState.errors.author?.name?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-author-name"
            maxLength={60}
            {...form.register('author.name')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.author.email')}
          htmlFor="general-author-email"
          hint={t('admin.settings.general.author.emailHint')}
          error={formState.errors.author?.email?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-author-email"
            type="email"
            {...form.register('author.email')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.author.homepage')}
          htmlFor="general-author-url"
          error={formState.errors.author?.url?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-author-url"
            type="url"
            placeholder="https://example.com"
            {...form.register('author.url')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
