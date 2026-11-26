import type { SiteIdentitySettings } from '@kobato/settings/types'

import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useFieldArray } from 'react-hook-form'

import { generalFormSchema, toFormValues, type GeneralFormValues } from '@/ui/settings/general/form-schema'
import { SettingsRow } from '@/ui/settings/SettingsSection'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'

export function GeneralIdentityCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
    section: 'general',
    source: siteIdentity,
    schema: generalFormSchema,
    toState: toFormValues,
    fromState: (values) => ({
      title: values.title.trim(),
      titleSeparator: values.titleSeparator.trim(),
      description: values.description.trim(),
      website: values.website.trim(),
      keywords: values.keywords.map((k) => k.value.trim()).filter((v) => v.length > 0),
    }),
  })

  const keywords = useFieldArray({ control: form.control, name: 'keywords' })
  const { formState } = form

  return (
    <SettingGroup
      title={t('admin.settings.general.identity.title')}
      description={t('admin.settings.general.identity.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.general.title')}
          htmlFor="general-title"
          error={formState.errors.title?.message}
        >
          <SettingsInput flushOnBlur={flushOnBlur} id="general-title" maxLength={120} {...form.register('title')} />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.separator')}
          htmlFor="general-title-separator"
          hint={t('admin.settings.general.separatorHint')}
          error={formState.errors.titleSeparator?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-title-separator"
            maxLength={10}
            placeholder="-"
            {...form.register('titleSeparator')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.description')}
          htmlFor="general-description"
          hint={t('admin.settings.general.descriptionHint')}
          error={formState.errors.description?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-description"
            maxLength={240}
            {...form.register('description')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.website')}
          htmlFor="general-website"
          hint={t('admin.settings.general.websiteHint')}
          error={formState.errors.website?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-website"
            type="url"
            placeholder="https://example.com"
            {...form.register('website')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.general.keywords')}
          hint={t('admin.settings.general.keywordsHint')}
          error={formState.errors.keywords?.message || formState.errors.keywords?.root?.message}
        >
          <div className="flex flex-col gap-2">
            {keywords.fields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <SettingsInput
                  flushOnBlur={flushOnBlur}
                  maxLength={60}
                  placeholder={t('admin.settings.general.keywordPlaceholder')}
                  aria-invalid={formState.errors.keywords?.[index]?.value ? true : undefined}
                  {...form.register(`keywords.${index}.value` as const)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => keywords.remove(index)}
                  aria-label={t('admin.settings.general.removeKeyword')}
                >
                  <Trash2Icon data-icon />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => keywords.append({ value: '' })}
              disabled={keywords.fields.length >= 20}
            >
              <PlusIcon data-icon /> {t('admin.settings.general.addKeyword')}
            </Button>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
