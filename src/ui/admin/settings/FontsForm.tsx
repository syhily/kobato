import { UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

import type { FontsSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { extractApiErrorMessage } from '@/ui/lib/api-error'

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

function FontsWebFontNoticeCard() {
  return (
    <SettingGroup
      title="网页字体"
      description="网站字体与槽位分配。前往字体库上传 TTF/OTF 自动分包，拖拽分配到全站 / 文章 / 代码槽位。"
    >
      <SettingGroupContent>
        <Link
          to="/admin/library/fonts"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          打开字体库 →
        </Link>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function FontsForm({ fonts }: FontsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <FontsWebFontNoticeCard />
      <FontsCanvasCard fonts={fonts} />
    </div>
  )
}
