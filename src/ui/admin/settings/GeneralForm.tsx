import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { z } from 'zod'

import type { SiteIdentitySettings } from '@/shared/config/types'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { I18N_SETTINGS_ENABLED } from '@/shared/i18n/feature-flags'
import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES, type AppLocale } from '@/shared/i18n/locales'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsCombobox } from '@/ui/admin/settings/shell/SettingsCombobox'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

interface TimeZoneItem {
  value: string
  label: string
}

interface GeneralFormProps {
  siteIdentity: SiteIdentitySettings
  timeZones: readonly string[]
}

// Client-only validation copy: message IDS (typed against the UI catalog), never
// prose. `useSettingsCard` localizes them before they reach RHF errors.
const MSG = {
  titleRequired: 'admin.settings.validation.titleRequired',
  separatorRequired: 'admin.settings.validation.separatorRequired',
  descriptionRequired: 'admin.settings.validation.descriptionRequired',
  websiteInvalid: 'admin.settings.validation.websiteInvalid',
  keywordRequired: 'admin.settings.validation.keywordRequired',
  keywordsMax: 'admin.settings.validation.keywordsMax',
  authorNameRequired: 'admin.settings.validation.authorNameRequired',
  emailInvalid: 'admin.settings.validation.emailInvalid',
  localeRequired: 'admin.settings.validation.localeRequired',
  timeZoneRequired: 'admin.settings.validation.timeZoneRequired',
  timeFormatRequired: 'admin.settings.validation.timeFormatRequired',
  max10: 'admin.settings.validation.maxChars10',
  max40: 'admin.settings.validation.maxChars40',
  max60: 'admin.settings.validation.maxChars60',
  max64: 'admin.settings.validation.maxChars64',
  max120: 'admin.settings.validation.maxChars120',
  max240: 'admin.settings.validation.maxChars240',
  initialYearMin: 'admin.settings.validation.initialYearMin',
  initialYearMax: 'admin.settings.validation.initialYearMax',
} as const satisfies Record<string, UiMessageId>

const TIME_FORMAT_AUTO = 'auto'
const TIME_FORMAT_CUSTOM = 'custom'
/** Seed used when an admin switches from "follow the locale" to a custom pattern. */
const DEFAULT_TIME_FORMAT_PATTERN = 'yyyy-LL-dd HH:mm'

const generalFormSchema = z.object({
  title: z.string().trim().min(1, MSG.titleRequired).max(120, MSG.max120),
  titleSeparator: z.string().trim().min(1, MSG.separatorRequired).max(10, MSG.max10),
  description: z.string().trim().min(1, MSG.descriptionRequired).max(240, MSG.max240),
  website: z.url({ message: MSG.websiteInvalid }),
  keywords: z
    .array(
      z.object({
        value: z.string().trim().min(1, MSG.keywordRequired).max(60, MSG.max60),
      }),
    )
    .max(20, MSG.keywordsMax),
  author: z.object({
    name: z.string().trim().min(1, MSG.authorNameRequired).max(60, MSG.max60),
    email: z.email({ message: MSG.emailInvalid }),
    url: z.url({ message: MSG.websiteInvalid }),
  }),
  locale: z.enum(SUPPORTED_LOCALES, { message: MSG.localeRequired }),
  timeZone: z.string().trim().min(1, MSG.timeZoneRequired).max(64, MSG.max64),
  timeFormat: z.string().trim().min(1, MSG.timeFormatRequired).max(40, MSG.max40).nullable(),
  initialYear: z.coerce.number().int().min(1970, MSG.initialYearMin).max(9999, MSG.initialYearMax),
  icpNo: z.string().trim().max(60, MSG.max60).optional(),
  moeIcpNo: z.string().trim().max(60, MSG.max60).optional(),
})
type GeneralFormValues = z.infer<typeof generalFormSchema>

function toFormValues(source: SiteIdentitySettings): GeneralFormValues {
  return {
    title: source.title,
    titleSeparator: source.titleSeparator,
    description: source.description,
    website: source.website,
    keywords: source.keywords.map((value) => ({ value })),
    author: { name: source.author.name, email: source.author.email, url: source.author.url },
    locale: source.locale,
    timeZone: source.timeZone,
    timeFormat: source.timeFormat,
    initialYear: source.initialYear,
    icpNo: source.icpNo ?? '',
    moeIcpNo: source.moeIcpNo ?? '',
  }
}

function GeneralIdentityCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
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
      title="基本信息"
      description="站点标题、描述、关键词、作者签名。SEO 和邮件模板也会读取这些字段。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="站点标题" htmlFor="general-title" error={formState.errors.title?.message}>
          <SettingsInput flushOnBlur={flushOnBlur} id="general-title" maxLength={120} {...form.register('title')} />
        </SettingsRow>
        <SettingsRow
          label="标题分隔符"
          htmlFor="general-title-separator"
          hint="连接页面标题与站点标题的符号，例如 -、·、｜。"
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
          label="站点描述"
          htmlFor="general-description"
          hint="出现在首页 SEO description 与默认 meta 中。"
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
          label="站点 URL"
          htmlFor="general-website"
          hint="必须是完整的 https URL，结尾不带斜杠。"
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
          label="关键词"
          hint="搜索引擎 keyword meta，每个不超过 60 字符，最多 20 个。"
          error={formState.errors.keywords?.message || formState.errors.keywords?.root?.message}
        >
          <div className="flex flex-col gap-2">
            {keywords.fields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <SettingsInput
                  flushOnBlur={flushOnBlur}
                  maxLength={60}
                  placeholder="例如：blog"
                  aria-invalid={formState.errors.keywords?.[index]?.value ? true : undefined}
                  {...form.register(`keywords.${index}.value` as const)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => keywords.remove(index)}
                  aria-label="删除关键词"
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
              <PlusIcon data-icon /> 添加关键词
            </Button>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function GeneralFooterCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
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
    <SettingGroup title="页脚信息" description="网站页脚的版权年份与备案号。" {...settingGroupProps}>
      <SettingGroupContent>
        <SettingsRow label="起始年份" htmlFor="general-initial-year" error={formState.errors.initialYear?.message}>
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-initial-year"
            type="number"
            min={1970}
            max={9999}
            {...form.register('initialYear', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="ICP 备案号" htmlFor="general-icp" error={formState.errors.icpNo?.message}>
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-icp"
            maxLength={60}
            placeholder="例如：皖ICP备2021002315号-2"
            {...form.register('icpNo')}
          />
        </SettingsRow>
        <SettingsRow label="萌国备案号" htmlFor="general-moe-icp" error={formState.errors.moeIcpNo?.message}>
          <SettingsInput flushOnBlur={flushOnBlur} id="general-moe-icp" maxLength={60} {...form.register('moeIcpNo')} />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function GeneralAuthorCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
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
      title="作者信息"
      description="评论邮件 + RSS feed 的 author 字段都引用这里的姓名 / 邮箱 / 主页。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="作者姓名" htmlFor="general-author-name" error={formState.errors.author?.name?.message}>
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-author-name"
            maxLength={60}
            {...form.register('author.name')}
          />
        </SettingsRow>
        <SettingsRow
          label="作者邮箱"
          htmlFor="general-author-email"
          hint="评论通知 / 待审核提醒发件人。"
          error={formState.errors.author?.email?.message}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="general-author-email"
            type="email"
            {...form.register('author.email')}
          />
        </SettingsRow>
        <SettingsRow label="作者主页" htmlFor="general-author-url" error={formState.errors.author?.url?.message}>
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

function GeneralTimeZoneCard({
  siteIdentity,
  timeZones,
}: {
  siteIdentity: SiteIdentitySettings
  timeZones: readonly string[]
}) {
  const { form, settingGroupProps, flushOnBlur, save } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
    section: 'general',
    source: siteIdentity,
    schema: generalFormSchema,
    toState: toFormValues,
    fromState: (values) => ({
      locale: values.locale,
      timeZone: values.timeZone.trim(),
      // `null` is the "follow the locale" state, never a blank override.
      timeFormat: values.timeFormat === null ? null : values.timeFormat.trim(),
    }),
  })

  const timeZoneItems = useMemo<TimeZoneItem[]>(
    () => timeZones.map((zone) => ({ value: zone, label: zone })),
    [timeZones],
  )
  const { formState } = form

  // Switching to "custom" restores the last pattern the admin typed, so the
  // round-trip through "follow the locale" never silently loses it.
  // `useWatch` (never `form.watch`) — the React Compiler would freeze a
  // render-time `watch()` value at its initial state.
  const timeFormat = useWatch({ control: form.control, name: 'timeFormat' })
  const lastPatternRef = useRef(siteIdentity.timeFormat ?? DEFAULT_TIME_FORMAT_PATTERN)
  useEffect(() => {
    if (typeof timeFormat === 'string' && timeFormat.trim() !== '') {
      lastPatternRef.current = timeFormat
    }
  }, [timeFormat])

  return (
    <SettingGroup
      title="时间与本地化"
      description="影响日期格式化函数以及 OG 图、邮件模板等所有依赖时区的渲染分支。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        {I18N_SETTINGS_ENABLED ? (
          <SettingsRow
            label="语言"
            htmlFor="general-locale"
            hint="站点界面、系统邮件与服务端输出的统一语言。"
            error={formState.errors.locale?.message}
          >
            <Controller
              control={form.control}
              name="locale"
              render={({ field }) => (
                <SettingsSelect<AppLocale>
                  name={field.name}
                  value={field.value}
                  save={save}
                  onValueChange={(value) => {
                    if (value !== null) {
                      field.onChange(value)
                    }
                  }}
                >
                  <SelectTrigger id="general-locale" className="w-full">
                    <SelectValue>{(value: AppLocale | null) => (value ? LOCALE_DISPLAY_NAMES[value] : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LOCALES.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {LOCALE_DISPLAY_NAMES[locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SettingsSelect>
              )}
            />
          </SettingsRow>
        ) : null}
        <SettingsRow
          label="时区"
          htmlFor="general-timezone"
          hint="IANA / tzdata 时区，输入关键字过滤。"
          error={formState.errors.timeZone?.message}
        >
          <Controller
            control={form.control}
            name="timeZone"
            render={({ field }) => {
              const selected = timeZoneItems.find((item) => item.value === field.value) ?? null
              return (
                <SettingsCombobox<TimeZoneItem>
                  name={field.name}
                  items={timeZoneItems}
                  value={selected}
                  save={save}
                  onValueChange={(item) => {
                    if (item) {
                      field.onChange(item.value)
                    }
                  }}
                >
                  <ComboboxTrigger id="general-timezone" className="w-full">
                    <ComboboxValue placeholder="搜索 IANA 时区…" />
                  </ComboboxTrigger>
                  <ComboboxContent<TimeZoneItem> inputPlaceholder="搜索 IANA 时区…" emptyMessage="无匹配时区">
                    {(item) => (
                      <ComboboxItem key={item.value} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxContent>
                </SettingsCombobox>
              )
            }}
          />
        </SettingsRow>
        <SettingsRow
          label="日期格式"
          htmlFor="general-time-format-mode"
          hint="跟随语言时使用当前语言的默认格式；自定义支持 yyyy / LL / MM / dd / HH / mm / ss 占位符，例如 yyyy-LL-dd HH:mm。"
          error={formState.errors.timeFormat?.message}
        >
          <div className="flex flex-col gap-2">
            <SettingsSelect<string>
              name="timeFormat"
              value={timeFormat === null ? TIME_FORMAT_AUTO : TIME_FORMAT_CUSTOM}
              save={save}
              onValueChange={(value) => {
                form.setValue('timeFormat', value === TIME_FORMAT_AUTO ? null : lastPatternRef.current, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }}
            >
              <SelectTrigger id="general-time-format-mode" className="w-full">
                <SelectValue>
                  {(value: string | null) => (value === TIME_FORMAT_CUSTOM ? '自定义' : '跟随语言')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TIME_FORMAT_AUTO}>跟随语言</SelectItem>
                <SelectItem value={TIME_FORMAT_CUSTOM}>自定义</SelectItem>
              </SelectContent>
            </SettingsSelect>
            {timeFormat !== null ? (
              <SettingsInput
                flushOnBlur={flushOnBlur}
                id="general-time-format"
                maxLength={40}
                placeholder={DEFAULT_TIME_FORMAT_PATTERN}
                {...form.register('timeFormat')}
              />
            ) : null}
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function GeneralForm({ siteIdentity, timeZones }: GeneralFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <GeneralIdentityCard siteIdentity={siteIdentity} />
      <GeneralFooterCard siteIdentity={siteIdentity} />
      <GeneralAuthorCard siteIdentity={siteIdentity} />
      <GeneralTimeZoneCard siteIdentity={siteIdentity} timeZones={timeZones} />
    </div>
  )
}
