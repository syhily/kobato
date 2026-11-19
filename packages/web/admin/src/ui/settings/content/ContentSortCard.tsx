import type { ContentSettings } from '@kobato/settings/types.ts'

import { FieldLabel } from '@kobato/ui/components/field.tsx'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { SORT_BY_ITEMS, SORT_DIR_ITEMS } from '@kobato/web-admin/ui/settings/content/model.ts'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsSelect } from '@kobato/web-admin/ui/settings/shell/SettingsSelect.tsx'
import { SettingsSwitch } from '@kobato/web-admin/ui/settings/shell/SettingsSwitch.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'
import { Controller } from 'react-hook-form'

export function ContentSortCard({ content }: { content: ContentSettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, save } = useSettingsCard<
    ContentSettings,
    {
      postSort: 'asc' | 'desc'
      postSortBy: 'publishedAt' | 'updatedAt'
      postFeatureEnabled: boolean
    }
  >({
    section: 'content',
    source: content,
    toState: (source) => ({
      postSort: source.post.sort,
      postSortBy: source.post.sortBy,
      postFeatureEnabled: source.post.featureEnabled ?? false,
    }),
    fromState: (state) => ({
      post: {
        sort: state.postSort,
        sortBy: state.postSortBy,
        featureEnabled: state.postFeatureEnabled,
      },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.content.sort.title')}
      description={t('admin.settings.content.sort.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.content.sort.field')} htmlFor="content-post-sort-by">
          <Controller
            control={form.control}
            name="postSortBy"
            render={({ field }) => (
              <SettingsSelect name={field.name} value={field.value} onValueChange={field.onChange} save={save}>
                <SelectTrigger id="content-post-sort-by" className="w-full">
                  <SelectValue>
                    {(value: string | null) => {
                      const option = SORT_BY_ITEMS.find((o) => o.value === value)
                      return option === undefined ? (value ?? '') : t(option.labelId)
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_BY_ITEMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.content.sort.direction')} htmlFor="content-post-sort">
          <Controller
            control={form.control}
            name="postSort"
            render={({ field }) => (
              <SettingsSelect name={field.name} value={field.value} onValueChange={field.onChange} save={save}>
                <SelectTrigger id="content-post-sort" className="w-full">
                  <SelectValue>
                    {(value: string | null) => {
                      const option = SORT_DIR_ITEMS.find((o) => o.value === value)
                      return option === undefined ? (value ?? '') : t(option.labelId)
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_DIR_ITEMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.content.sort.feature')}
          hint={t('admin.settings.content.sort.featureHint')}
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="postFeatureEnabled"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="content-post-feature-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="content-post-feature-enabled" className="font-normal">
              {t('admin.settings.content.sort.featureLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
