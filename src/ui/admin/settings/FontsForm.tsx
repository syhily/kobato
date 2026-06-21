import { PlusIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useFieldArray } from 'react-hook-form'
import { useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

import type { FontsSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { extractApiErrorMessage } from '@/ui/lib/api-error'

interface CssRow {
  clientId: string
  url: string
}

interface FontsFormProps {
  fonts: FontsSettings
}

async function uploadFont(slot: 'og' | 'calendar', file: File, csrfToken: string | undefined): Promise<void> {
  const formData = new FormData()
  formData.append('slot', slot)
  formData.append('file', file)
  const headers: Record<string, string> = {}
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken
  }
  const res = await fetch('/api/admin/fonts/upload', { method: 'POST', body: formData, headers })
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null)
    const message = extractApiErrorMessage(data)
    throw new Error(message ?? `上传失败 (${res.status})`)
  }
}

function FontUploadRow({ slot, label, family }: { slot: 'og' | 'calendar'; label: string; family: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken

  const handleFileChange = async (file: File) => {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.ttf') && !lower.endsWith('.otf')) {
      toast.error('文件类型错误', { description: '仅支持 .ttf 或 .otf 字体文件' })
      return
    }
    if (file.size > 60 * 1024 * 1024) {
      toast.error('文件过大', { description: '字体文件大小上限为 60 MB' })
      return
    }
    setUploading(true)
    try {
      await uploadFont(slot, file, csrfToken)
      toast.success(`${label} 已上传`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".ttf,.otf"
        hidden
        aria-label={`选择 ${label} 文件`}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            void handleFileChange(f)
          }
          e.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon data-icon="sm" />
        {uploading ? '上传中…' : '上传字体'}
      </Button>
      <span className="text-sm text-muted-foreground">{family ? `已配置族名：${family}` : '未配置族名'}</span>
    </div>
  )
}

function FontsCanvasCard({ fonts }: { fonts: FontsSettings }) {
  const { form, settingGroupProps, display, flushOnBlur } = useSettingsCard<
    FontsSettings,
    { ogFamily: string; calendarFamily: string }
  >({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      ogFamily: source.og.family,
      calendarFamily: source.calendar.family,
    }),
    fromState: (state) => ({
      og: { family: state.ogFamily.trim() },
      calendar: { family: state.calendarFamily.trim() },
    }),
  })

  return (
    <SettingGroup
      title="Canvas 字体"
      description="服务端渲染 OG 图与日历图时使用的本地 TTF/OTF 字体文件。上传字体后配置族名，留空时降级使用系统中文字体。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="OG 图字体" htmlFor="fonts-og-family">
          <div className="flex flex-col gap-2">
            <FontUploadRow slot="og" label="OG 图字体" family={display.og.family} />
            <SettingsInput
              id="fonts-og-family"
              type="text"
              placeholder="族名，例如 OPPOSans"
              maxLength={100}
              flushOnBlur={flushOnBlur}
              {...form.register('ogFamily')}
            />
          </div>
        </SettingsRow>
        <SettingsRow label="日历图字体" htmlFor="fonts-calendar-family">
          <div className="flex flex-col gap-2">
            <FontUploadRow slot="calendar" label="日历图字体" family={display.calendar.family} />
            <SettingsInput
              id="fonts-calendar-family"
              type="text"
              placeholder="族名，例如 OPPOSerif"
              maxLength={100}
              flushOnBlur={flushOnBlur}
              {...form.register('calendarFamily')}
            />
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function FontsGlobalCssCard({ fonts }: { fonts: FontsSettings }) {
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<
    FontsSettings,
    { globalCss: CssRow[]; globalFamily: string }
  >({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      globalCss: source.globalCss.map((url, i) => ({ clientId: `css-global-${i}`, url })),
      globalFamily: source.globalFamily,
    }),
    fromState: (state) => ({
      globalCss: state.globalCss.map((row) => row.url.trim()).filter((url) => url !== ''),
      globalFamily: state.globalFamily.trim(),
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'globalCss' })

  return (
    <SettingGroup
      title="全站字体"
      description="全站所有页面加载。配置字体 CSS 后，填写族名让界面 UI 使用该字体；留空则使用默认无衬线字体。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="界面字体族名" htmlFor="fonts-global-family">
          <SettingsInput
            id="fonts-global-family"
            type="text"
            placeholder="族名，例如 OPPOSans（留空使用默认字体）"
            maxLength={100}
            flushOnBlur={flushOnBlur}
            {...form.register('globalFamily')}
          />
        </SettingsRow>
        <div className="flex flex-col gap-3">
          {rows.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有添加 CSS，点击下方按钮新增一项。</p>
          ) : (
            rows.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <SettingsInput
                  type="url"
                  placeholder="https://assets.example.com/fonts/<name>.css"
                  maxLength={500}
                  className="flex-1"
                  flushOnBlur={flushOnBlur}
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
    </SettingGroup>
  )
}

function FontsPostCssCard({ fonts }: { fonts: FontsSettings }) {
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<
    FontsSettings,
    { postCss: CssRow[]; postFamily: string }
  >({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      postCss: source.postCss.map((url, i) => ({ clientId: `css-post-${i}`, url })),
      postFamily: source.postFamily,
    }),
    fromState: (state) => ({
      postCss: state.postCss.map((row) => row.url.trim()).filter((url) => url !== ''),
      postFamily: state.postFamily.trim(),
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'postCss' })

  return (
    <SettingGroup
      title="文章页字体"
      description="仅在文章详情页加载。配置字体 CSS 后，填写族名让正文使用该字体；留空则使用默认衬线字体。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="正文字体族名" htmlFor="fonts-post-family">
          <SettingsInput
            id="fonts-post-family"
            type="text"
            placeholder="族名，例如 OPPOSerif（留空使用默认字体）"
            maxLength={100}
            flushOnBlur={flushOnBlur}
            {...form.register('postFamily')}
          />
        </SettingsRow>
        <div className="flex flex-col gap-3">
          {rows.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有添加 CSS，点击下方按钮新增一项。</p>
          ) : (
            rows.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <SettingsInput
                  type="url"
                  placeholder="https://assets.example.com/fonts/<name>.css"
                  maxLength={500}
                  className="flex-1"
                  flushOnBlur={flushOnBlur}
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
    </SettingGroup>
  )
}

function FontsCodeCard({ fonts }: { fonts: FontsSettings }) {
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<
    FontsSettings,
    { codeCss: CssRow[]; codeFamily: string }
  >({
    section: 'fonts',
    source: fonts,
    toState: (source) => ({
      codeCss: source.codeCss.map((url, i) => ({ clientId: `css-code-${i}`, url })),
      codeFamily: source.codeFamily,
    }),
    fromState: (state) => ({
      codeCss: state.codeCss.map((row) => row.url.trim()).filter((url) => url !== ''),
      codeFamily: state.codeFamily.trim(),
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'codeCss' })

  return (
    <SettingGroup
      title="代码字体"
      description="代码块和行内代码使用的等宽字体。配置字体 CSS 后，填写族名让代码使用该字体；留空则使用默认 Iosevka。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="代码字体族名" htmlFor="fonts-code-family">
          <SettingsInput
            id="fonts-code-family"
            type="text"
            placeholder="族名，例如 Iosevka（留空使用默认字体）"
            maxLength={100}
            flushOnBlur={flushOnBlur}
            {...form.register('codeFamily')}
          />
        </SettingsRow>
        <div className="flex flex-col gap-3">
          {rows.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有添加 CSS，点击下方按钮新增一项。</p>
          ) : (
            rows.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <SettingsInput
                  type="url"
                  placeholder="https://assets.example.com/fonts/<name>.css"
                  maxLength={500}
                  className="flex-1"
                  flushOnBlur={flushOnBlur}
                  {...form.register(`codeCss.${index}.url` as const)}
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
              <PlusIcon /> 添加代码 CSS
            </Button>
            {rows.fields.length >= 8 && <span className="ml-2 text-xs text-muted-foreground">上限 8 条</span>}
          </div>
        </div>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function FontsForm({ fonts }: FontsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <FontsCanvasCard fonts={fonts} />
      <FontsGlobalCssCard fonts={fonts} />
      <FontsPostCssCard fonts={fonts} />
      <FontsCodeCard fonts={fonts} />
    </div>
  )
}
