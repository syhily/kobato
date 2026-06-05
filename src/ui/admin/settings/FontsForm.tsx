import { PlusIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'

import type { FontsSettings } from '@/shared/config/types'

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

async function uploadFont(slot: 'og' | 'calendar', file: File): Promise<void> {
  const formData = new FormData()
  formData.append('slot', slot)
  formData.append('file', file)
  const res = await fetch('/api/admin/fonts/upload', { method: 'POST', body: formData })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(data?.error?.message ?? `上传失败 (${res.status})`)
  }
}

function FontUploadRow({
  slot,
  label,
  family,
  mode,
}: {
  slot: 'og' | 'calendar'
  label: string
  family: string
  mode: 'read' | 'edit'
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (file: File) => {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.ttf') && !lower.endsWith('.otf')) {
      toast.error('文件类型错误', { description: '仅支持 .ttf 或 .otf 字体文件' })
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('文件过大', { description: '字体文件大小上限为 20 MB' })
      return
    }
    setUploading(true)
    try {
      await uploadFont(slot, file)
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
      {mode === 'edit' && (
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
      )}
      <span className="text-sm text-muted-foreground">{family ? `已配置族名：${family}` : '未配置族名'}</span>
    </div>
  )
}

function FontsCanvasCard({ fonts }: { fonts: FontsSettings }) {
  const { mode, form, settingGroupProps, display } = useSettingsCard<
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
      {mode === 'edit' ? (
        <SettingGroupContent>
          <SettingsRow label="OG 图字体" htmlFor="fonts-og-family">
            <div className="flex flex-col gap-2">
              <FontUploadRow slot="og" label="OG 图字体" family={display.og.family} mode={mode} />
              <Input
                id="fonts-og-family"
                type="text"
                placeholder="族名，例如 OPPOSans"
                maxLength={100}
                {...form.register('ogFamily')}
              />
            </div>
          </SettingsRow>
          <SettingsRow label="日历图字体" htmlFor="fonts-calendar-family">
            <div className="flex flex-col gap-2">
              <FontUploadRow slot="calendar" label="日历图字体" family={display.calendar.family} mode={mode} />
              <Input
                id="fonts-calendar-family"
                type="text"
                placeholder="族名，例如 OPPOSerif"
                maxLength={100}
                {...form.register('calendarFamily')}
              />
            </div>
          </SettingsRow>
        </SettingGroupContent>
      ) : (
        <SettingGroupContent>
          <SettingValue label="OG 图字体" value={display.og.family || '—'} />
          <SettingValue label="日历图字体" value={display.calendar.family || '—'} />
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
                    placeholder="https://assets.example.com/fonts/<name>.css"
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
                    placeholder="https://assets.example.com/fonts/<name>.css"
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
