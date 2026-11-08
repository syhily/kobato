import { Controller } from 'react-hook-form'

import type { ContentSettings } from '@/shared/config/types'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { DEFAULT_FOOTNOTES_SECTION_TITLE } from '@/shared/utils/footnotes-section-title'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { useI18n } from '@/ui/lib/I18nProvider'

interface ContentFormProps {
  content: ContentSettings
}

const SORT_DIR_ITEMS = [
  { value: 'desc', labelId: 'admin.settings.content.sort.dir.desc' },
  { value: 'asc', labelId: 'admin.settings.content.sort.dir.asc' },
] as const satisfies readonly { value: 'asc' | 'desc'; labelId: UiMessageId }[]

const SORT_BY_ITEMS = [
  { value: 'publishedAt', labelId: 'admin.settings.content.sort.by.publishedAt' },
  { value: 'updatedAt', labelId: 'admin.settings.content.sort.by.updatedAt' },
] as const satisfies readonly { value: 'publishedAt' | 'updatedAt'; labelId: UiMessageId }[]

function ContentPaginationCard({ content }: { content: ContentSettings }) {
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

function ContentFeedCard({ content }: { content: ContentSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps, save } = useSettingsCard<
    ContentSettings,
    { feedFull: boolean; feedSize: number }
  >({
    section: 'content',
    source: content,
    toState: (source) => ({
      feedFull: source.feed.full,
      feedSize: source.feed.size,
    }),
    fromState: (state) => ({
      feed: { full: state.feedFull, size: state.feedSize },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.content.feed.title')}
      description={t('admin.settings.content.feed.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.content.feed.full')} hint={t('admin.settings.content.feed.fullHint')}>
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="feedFull"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="content-feed-full"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
              )}
            />
            <FieldLabel htmlFor="content-feed-full" className="font-normal">
              {t('admin.settings.content.feed.fullLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow label={t('admin.settings.content.feed.size')} htmlFor="content-feed-size">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-feed-size"
            type="number"
            min={1}
            max={100}
            {...form.register('feedSize', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function ContentSortCard({ content }: { content: ContentSettings }) {
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

function ContentFootnotesCard({ content }: { content: ContentSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<ContentSettings, { footnotesSectionTitle: string }>({
    section: 'content',
    source: content,
    toState: (source) => ({
      footnotesSectionTitle: source.footnotes?.sectionTitle ?? DEFAULT_FOOTNOTES_SECTION_TITLE,
    }),
    fromState: (state) => ({
      footnotes: { sectionTitle: state.footnotesSectionTitle.trim() || DEFAULT_FOOTNOTES_SECTION_TITLE },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.content.footnotes.title')}
      description={t('admin.settings.content.footnotes.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.content.footnotes.label')} htmlFor="content-footnotes-section-title">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-footnotes-section-title"
            type="text"
            maxLength={120}
            {...form.register('footnotesSectionTitle')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function ContentForm({ content }: ContentFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <ContentPaginationCard content={content} />
      <ContentFeedCard content={content} />
      <ContentSortCard content={content} />
      <ContentFootnotesCard content={content} />
    </div>
  )
}
