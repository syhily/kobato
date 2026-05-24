import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import { z } from 'zod'

import type { SiteIdentitySettings } from '@/shared/config/blog'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { Input } from '@/ui/components/input'

interface TimeZoneItem {
  value: string
  label: string
}

interface GeneralFormProps {
  siteIdentity: SiteIdentitySettings
  timeZones: readonly string[]
}

const generalFormSchema = z.object({
  title: z.string().trim().min(1, '请填写站点标题').max(120, '最多 120 个字符'),
  description: z.string().trim().min(1, '请填写站点描述').max(240, '最多 240 个字符'),
  website: z.url({ message: '请填写完整的 URL（包含 https://）' }),
  keywords: z
    .array(
      z.object({
        value: z.string().trim().min(1, '关键词不能为空').max(60, '最多 60 个字符'),
      }),
    )
    .max(20, '最多 20 个关键词'),
  author: z.object({
    name: z.string().trim().min(1, '请填写作者姓名').max(60, '最多 60 个字符'),
    email: z.email({ message: '请填写合法的邮箱地址' }),
    url: z.url({ message: '请填写完整的 URL（包含 https://）' }),
  }),
  locale: z.string().trim().min(2, 'BCP 47 标签至少 2 个字符').max(35, '最多 35 个字符'),
  timeZone: z.string().trim().min(1, '请选择时区').max(64, '最多 64 个字符'),
  timeFormat: z.string().trim().min(1, '请填写日期格式').max(40, '最多 40 个字符'),
  initialYear: z.coerce.number().int().min(1970, '年份不能早于 1970').max(9999, '年份不能超过 9999'),
  icpNo: z.string().trim().max(60, '最多 60 个字符').optional(),
  moeIcpNo: z.string().trim().max(60, '最多 60 个字符').optional(),
})
type GeneralFormValues = z.infer<typeof generalFormSchema>

function toFormValues(source: SiteIdentitySettings): GeneralFormValues {
  return {
    title: source.title,
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
  const { mode, form, settingGroupProps, display } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
    section: 'general',
    source: siteIdentity,
    schema: generalFormSchema,
    toState: toFormValues,
    fromState: (values) => ({
      title: values.title.trim(),
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
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="站点标题" htmlFor="general-title" error={formState.errors.title?.message}>
            <Input id="general-title" maxLength={120} {...form.register('title')} />
          </SettingsRow>
          <SettingsRow
            label="站点描述"
            htmlFor="general-description"
            hint="出现在首页 SEO description 与默认 meta 中。"
            error={formState.errors.description?.message}
          >
            <Input id="general-description" maxLength={240} {...form.register('description')} />
          </SettingsRow>
          <SettingsRow
            label="站点 URL"
            htmlFor="general-website"
            hint="必须是完整的 https URL，结尾不带斜杠。"
            error={formState.errors.website?.message}
          >
            <Input id="general-website" type="url" placeholder="https://example.com" {...form.register('website')} />
          </SettingsRow>
          <SettingsRow
            label="关键词"
            hint="搜索引擎 keyword meta，每个不超过 60 字符，最多 20 个。"
            error={formState.errors.keywords?.message || formState.errors.keywords?.root?.message}
          >
            <div className="flex flex-col gap-2">
              {keywords.fields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <Input
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
      ) : (
        <SettingGroupContent>
          <SettingValue label="站点标题" value={display.title} />
          <SettingValue label="站点描述" value={display.description} />
          <SettingValue label="站点 URL" value={display.website} />
          <SettingValue label="关键词" value={display.keywords.join('、') || '—'} />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function GeneralFooterCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
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
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="起始年份" htmlFor="general-initial-year" error={formState.errors.initialYear?.message}>
            <Input
              id="general-initial-year"
              type="number"
              min={1970}
              max={9999}
              {...form.register('initialYear', { valueAsNumber: true })}
            />
          </SettingsRow>
          <SettingsRow label="ICP 备案号" htmlFor="general-icp" error={formState.errors.icpNo?.message}>
            <Input
              id="general-icp"
              maxLength={60}
              placeholder="例如：皖ICP备2021002315号-2"
              {...form.register('icpNo')}
            />
          </SettingsRow>
          <SettingsRow label="萌国备案号" htmlFor="general-moe-icp" error={formState.errors.moeIcpNo?.message}>
            <Input id="general-moe-icp" maxLength={60} {...form.register('moeIcpNo')} />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="起始年份" value={`${display.initialYear}`} />
          <SettingValue label="ICP 备案号" value={display.icpNo || '—'} />
          <SettingValue label="萌国备案号" value={display.moeIcpNo || '—'} />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function GeneralAuthorCard({ siteIdentity }: { siteIdentity: SiteIdentitySettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
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
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="作者姓名" htmlFor="general-author-name" error={formState.errors.author?.name?.message}>
            <Input id="general-author-name" maxLength={60} {...form.register('author.name')} />
          </SettingsRow>
          <SettingsRow
            label="作者邮箱"
            htmlFor="general-author-email"
            hint="评论通知 / 待审核提醒发件人。"
            error={formState.errors.author?.email?.message}
          >
            <Input id="general-author-email" type="email" {...form.register('author.email')} />
          </SettingsRow>
          <SettingsRow label="作者主页" htmlFor="general-author-url" error={formState.errors.author?.url?.message}>
            <Input
              id="general-author-url"
              type="url"
              placeholder="https://example.com"
              {...form.register('author.url')}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="作者姓名" value={display.author.name} />
          <SettingValue label="作者邮箱" value={display.author.email} />
          <SettingValue label="作者主页" value={display.author.url} />
        </SettingGroupContent>
      )}
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
  const { mode, form, settingGroupProps, display } = useSettingsCard<SiteIdentitySettings, GeneralFormValues>({
    section: 'general',
    source: siteIdentity,
    schema: generalFormSchema,
    toState: toFormValues,
    fromState: (values) => ({
      locale: values.locale.trim(),
      timeZone: values.timeZone.trim(),
      timeFormat: values.timeFormat.trim(),
    }),
  })

  const timeZoneItems = useMemo<TimeZoneItem[]>(
    () => timeZones.map((zone) => ({ value: zone, label: zone })),
    [timeZones],
  )
  const { formState } = form

  return (
    <SettingGroup
      title="时间与本地化"
      description="影响日期格式化函数以及 OG 图、邮件模板等所有依赖时区的渲染分支。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow
            label="语言"
            htmlFor="general-locale"
            hint="BCP 47 语言标签，例如 zh-CN、en-US。"
            error={formState.errors.locale?.message}
          >
            <Input id="general-locale" maxLength={35} placeholder="zh-CN" {...form.register('locale')} />
          </SettingsRow>
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
                  <Combobox<TimeZoneItem>
                    items={timeZoneItems}
                    value={selected}
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
                  </Combobox>
                )
              }}
            />
          </SettingsRow>
          <SettingsRow
            label="日期格式"
            htmlFor="general-time-format"
            hint="支持 yyyy / LL / MM / dd / HH / mm 占位符，例如 yyyy-LL-dd HH:mm。"
            error={formState.errors.timeFormat?.message}
          >
            <Input
              id="general-time-format"
              maxLength={40}
              placeholder="yyyy-LL-dd HH:mm"
              {...form.register('timeFormat')}
            />
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="语言" value={display.locale} />
          <SettingValue label="时区" value={display.timeZone} />
          <SettingValue label="日期格式" value={display.timeFormat} />
        </SettingGroupContent>
      )}
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
