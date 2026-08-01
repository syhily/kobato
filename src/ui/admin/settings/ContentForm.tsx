import { Controller } from 'react-hook-form'

import type { ContentSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

interface ContentFormProps {
  content: ContentSettings
}

const SORT_DIR_ITEMS = [
  { value: 'desc', label: '最新优先（desc）' },
  { value: 'asc', label: '最旧优先（asc）' },
]

const SORT_BY_ITEMS = [
  { value: 'publishedAt', label: '首次发布时间' },
  { value: 'updatedAt', label: '最近更新时间' },
]

function ContentPaginationCard({ content }: { content: ContentSettings }) {
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
      title="分页"
      description="每个列表页显示多少篇文章。改动会立即影响首页 / 分类 / 标签 / 搜索结果。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="首页每页文章数" htmlFor="content-pag-posts">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-pag-posts"
            type="number"
            min={1}
            max={100}
            {...form.register('pagPosts', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="分类页每页文章数" htmlFor="content-pag-category">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-pag-category"
            type="number"
            min={1}
            max={100}
            {...form.register('pagCategory', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="标签页每页文章数" htmlFor="content-pag-tags">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="content-pag-tags"
            type="number"
            min={1}
            max={100}
            {...form.register('pagTags', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="搜索结果每页数" htmlFor="content-pag-search">
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
      title="RSS / Atom Feed"
      description="决定 /feed 与 /feed/atom 输出的条目数与是否包含正文。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="包含完整正文" hint="关闭后只输出摘要 + 永久链接。订阅器中阅读体验更好但不利于离线阅读。">
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
              输出完整正文
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow label="Feed 条目数" htmlFor="content-feed-size">
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
      title="文章排序与置顶"
      description="文章列表的默认排序方向。开启置顶后，可在文章编辑页将文章置顶到首页精选区。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="排序字段" htmlFor="content-post-sort-by">
          <Controller
            control={form.control}
            name="postSortBy"
            render={({ field }) => (
              <SettingsSelect name={field.name} value={field.value} onValueChange={field.onChange} save={save}>
                <SelectTrigger id="content-post-sort-by" className="w-full">
                  <SelectValue>
                    {(value: string | null) => SORT_BY_ITEMS.find((o) => o.value === value)?.label ?? value ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_BY_ITEMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
        <SettingsRow label="排序方向" htmlFor="content-post-sort">
          <Controller
            control={form.control}
            name="postSort"
            render={({ field }) => (
              <SettingsSelect name={field.name} value={field.value} onValueChange={field.onChange} save={save}>
                <SelectTrigger id="content-post-sort" className="w-full">
                  <SelectValue>
                    {(value: string | null) => SORT_DIR_ITEMS.find((o) => o.value === value)?.label ?? value ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_DIR_ITEMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
        <SettingsRow label="开启置顶功能" hint="关闭后首页不展示精选文章，文章编辑页也不显示置顶开关。">
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
              首页展示置顶文章
            </FieldLabel>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function ContentFootnotesCard({ content }: { content: ContentSettings }) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<ContentSettings, { footnotesSectionTitle: string }>({
    section: 'content',
    source: content,
    toState: (source) => ({
      footnotesSectionTitle: source.footnotes?.sectionTitle ?? '尾声礼记',
    }),
    fromState: (state) => ({
      footnotes: { sectionTitle: state.footnotesSectionTitle.trim() || '尾声礼记' },
    }),
  })

  return (
    <SettingGroup
      title="脚注汇总标题"
      description="Portable Text 页面文末脚注列表上方的标题，默认为「尾声礼记」。文章页始终使用默认标题，不受此设置影响。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="标题文案" htmlFor="content-footnotes-section-title">
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
