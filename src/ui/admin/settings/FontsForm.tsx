import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useFieldArray } from 'react-hook-form'

import type { FontsSettings } from '@/shared/config/blog'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'

interface CssRow {
  clientId: string
  url: string
}

interface FontsFormProps {
  fonts: FontsSettings
}

function FontsCanvasCard({ fonts }: { fonts: FontsSettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<
    FontsSettings,
    { ogPath: string; ogFamily: string; calendarPath: string; calendarFamily: string }
  >({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      ogPath: source.og.path,
      ogFamily: source.og.family,
      calendarPath: source.calendar.path,
      calendarFamily: source.calendar.family,
    }),
    fromState: (state) => ({
      og: { path: state.ogPath.trim(), family: state.ogFamily.trim() },
      calendar: { path: state.calendarPath.trim(), family: state.calendarFamily.trim() },
    }),
  })

  return (
    <SettingGroup
      title="Canvas 字体"
      description="服务端渲染 OG 图与日历图时使用的本地 TTF/OTF 字体文件。留空时降级使用系统中文字体。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="OG 图字体" htmlFor="fonts-og-path">
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Input
                id="fonts-og-path"
                type="text"
                placeholder="文件名，例如 opposans.ttf"
                maxLength={200}
                className="sm:flex-[2]"
                {...form.register('ogPath')}
              />
              <Input
                type="text"
                placeholder="族名，例如 OPPOSans"
                maxLength={100}
                className="sm:flex-1"
                {...form.register('ogFamily')}
              />
            </div>
          </SettingsRow>
          <SettingsRow label="日历图字体" htmlFor="fonts-calendar-path">
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Input
                id="fonts-calendar-path"
                type="text"
                placeholder="文件名，例如 opposerif.ttf"
                maxLength={200}
                className="sm:flex-[2]"
                {...form.register('calendarPath')}
              />
              <Input
                type="text"
                placeholder="族名，例如 OPPOSerif"
                maxLength={100}
                className="sm:flex-1"
                {...form.register('calendarFamily')}
              />
            </div>
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue
            label="OG 图字体"
            value={display.og.path ? `${display.og.path}（${display.og.family}）` : '—'}
          />
          <SettingValue
            label="日历图字体"
            value={display.calendar.path ? `${display.calendar.path}（${display.calendar.family}）` : '—'}
          />
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function FontsGlobalCssCard({ fonts }: { fonts: FontsSettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<FontsSettings, { globalCss: CssRow[] }>({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      globalCss: source.globalCss.map((url, i) => ({ clientId: `css-global-${i}`, url })),
    }),
    fromState: (state) => ({
      globalCss: state.globalCss.map((row) => row.url.trim()).filter((url) => url !== ''),
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'globalCss' })

  return (
    <SettingGroup
      title="全站字体 CSS"
      description="每个 URL 都会在所有页面的 <head> 注入一个 <link rel='stylesheet'>。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <div className="flex flex-col gap-3">
            {rows.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有添加 CSS，点击下方按钮新增一项。</p>
            ) : (
              rows.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input
                    type="url"
                    placeholder="https://cat.yufan.me/fonts/<name>.css"
                    maxLength={500}
                    className="flex-1"
                    {...form.register(`globalCss.${index}.url` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => rows.remove(index)}
                    aria-label="删除此项"
                  >
                    <Trash2Icon className="text-destructive" />
                  </Button>
                </div>
              ))
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.fields.length >= 8}
                onClick={() => rows.append({ clientId: crypto.randomUUID(), url: '' })}
              >
                <PlusIcon /> 添加全站 CSS
              </Button>
              {rows.fields.length >= 8 && <span className="ml-2 text-xs text-muted-foreground">上限 8 条</span>}
            </div>
          </div>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          {display.globalCss.length === 0 ? (
            <p className="text-sm text-muted-foreground">未配置</p>
          ) : (
            display.globalCss.map((url, i) => <SettingValue key={url} label={`CSS ${i + 1}`} value={url} />)
          )}
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

function FontsPostCssCard({ fonts }: { fonts: FontsSettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<FontsSettings, { postCss: CssRow[] }>({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      postCss: source.postCss.map((url, i) => ({ clientId: `css-post-${i}`, url })),
    }),
    fromState: (state) => ({
      postCss: state.postCss.map((row) => row.url.trim()).filter((url) => url !== ''),
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'postCss' })

  return (
    <SettingGroup
      title="文章页字体 CSS"
      description="仅在文章详情页的 <head> 注入。适合体积大、仅长文阅读需要的字体。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <SettingGroupContent>
          <div className="flex flex-col gap-3">
            {rows.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有添加 CSS，点击下方按钮新增一项。</p>
            ) : (
              rows.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input
                    type="url"
                    placeholder="https://cat.yufan.me/fonts/<name>.css"
                    maxLength={500}
                    className="flex-1"
                    {...form.register(`postCss.${index}.url` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => rows.remove(index)}
                    aria-label="删除此项"
                  >
                    <Trash2Icon className="text-destructive" />
                  </Button>
                </div>
              ))
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.fields.length >= 8}
                onClick={() => rows.append({ clientId: crypto.randomUUID(), url: '' })}
              >
                <PlusIcon /> 添加文章页 CSS
              </Button>
              {rows.fields.length >= 8 && <span className="ml-2 text-xs text-muted-foreground">上限 8 条</span>}
            </div>
          </div>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          {display.postCss.length === 0 ? (
            <p className="text-sm text-muted-foreground">未配置</p>
          ) : (
            display.postCss.map((url, i) => <SettingValue key={url} label={`CSS ${i + 1}`} value={url} />)
          )}
        </SettingGroupContent>
      )}
    </SettingGroup>
  )
}

export function FontsForm({ fonts }: FontsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <FontsCanvasCard fonts={fonts} />
      <FontsGlobalCssCard fonts={fonts} />
      <FontsPostCssCard fonts={fonts} />
    </div>
  )
}
