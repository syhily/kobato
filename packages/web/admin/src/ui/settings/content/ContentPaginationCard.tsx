import type { ContentSettings } from '@kobato/settings/types'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'

export function ContentPaginationCard({ content }: { content: ContentSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<
    ContentSettings,
    { pagPosts: number; pagCategory: number; pagTags: number; pagSearch: number }
  >({
    section: 'content',
    source: content,
    toState: (source) => ({
      pagPosts: source.pagination.posts,
      pagCategory: source.pagination.category,
      pagTags: source.pagination.tags,
      pagSearch: source.pagination.search,
    }),
    fromState: (state) => ({
      pagination: {
        posts: state.pagPosts,
        category: state.pagCategory,
        tags: state.pagTags,
        search: state.pagSearch,
      },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.content.pagination.title')}
      description={t('admin.settings.content.pagination.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.content.pagination.posts')} htmlFor="content-pag-posts">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-pag-posts"
            type="number"
            min={1}
            max={100}
            {...form.register('pagPosts', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.content.pagination.category')} htmlFor="content-pag-category">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-pag-category"
            type="number"
            min={1}
            max={100}
            {...form.register('pagCategory', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.content.pagination.tags')} htmlFor="content-pag-tags">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-pag-tags"
            type="number"
            min={1}
            max={100}
            {...form.register('pagTags', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.content.pagination.search')} htmlFor="content-pag-search">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-pag-search"
            type="number"
            min={1}
            max={100}
            {...form.register('pagSearch', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
