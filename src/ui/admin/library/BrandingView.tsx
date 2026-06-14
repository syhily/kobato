import { useCallback, useRef, useState } from 'react'
import { useRevalidator, useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

import type { AssetsLoaderShape, BrandingSlotStatus } from '@/shared/config/projection'

import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { Button } from '@/ui/components/button'
import { Card, CardContent } from '@/ui/components/card'
import { extractApiErrorMessage } from '@/ui/lib/api-error'
import { cn } from '@/ui/lib/cn'

// Per-slot UI metadata. `publicPath` matches the server-side
// `ASSET_ROUTES` table and is shown to the operator so they know
// exactly which URL each upload feeds. `purpose` is short copy
// explaining *where* the asset shows up on the public site; `spec`
// is the recommended file format / dimensions / size cap.
type BrandingFileSlot =
  | 'faviconSvg'
  | 'faviconIco'
  | 'appleTouchIcon'
  | 'icon192'
  | 'icon512'
  | 'logoSvg'
  | 'logoDarkSvg'
  | 'logoLargeSvg'
  | 'logoLargeDarkSvg'
  | 'openGraph'
  | 'blogPoster'
  | 'blogPosterDark'
  | 'defaultAvatar'

interface SlotMeta {
  slot: BrandingFileSlot
  label: string
  publicPath: string
  accept: '.svg' | '.ico' | '.png'
  maxBytes: number
  purpose: string
  spec: string
  /** Render the preview thumbnail on a dark background — for dark-theme assets. */
  darkPreview?: boolean
}

interface SlotGroup {
  title: string
  description: string
  slots: SlotMeta[]
}

const SLOT_GROUPS: readonly SlotGroup[] = [
  {
    title: 'Favicon 套件',
    description:
      '浏览器标签页、操作系统主屏、PWA 安装时使用的站点图标。上传 Favicon SVG 后会自动生成下面 4 个尺寸；如需精细控制也可单独上传覆盖。',
    slots: [
      {
        slot: 'faviconSvg',
        label: 'Favicon SVG',
        publicPath: '/favicon.svg',
        accept: '.svg',
        maxBytes: 50 * 1024,
        purpose: '现代浏览器在地址栏、标签页、书签里展示的矢量图标，分辨率随场景自适应。',
        spec: '建议 32×32 安全区的纯矢量 SVG，文件不超过 50 KB。',
      },
      {
        slot: 'faviconIco',
        label: 'Favicon ICO',
        publicPath: '/favicon.ico',
        accept: '.ico',
        maxBytes: 100 * 1024,
        purpose: '老版本浏览器与 Windows 任务栏使用的多分辨率图标，通常由 SVG 自动生成。',
        spec: '建议包含 16×16 + 32×32 两组帧，文件不超过 100 KB。',
      },
      {
        slot: 'appleTouchIcon',
        label: 'Apple Touch Icon',
        publicPath: '/apple-touch-icon.png',
        accept: '.png',
        maxBytes: 200 * 1024,
        purpose: 'iOS / iPadOS 用户将网站添加到主屏幕时的图标，也用于 Safari 的稍后阅读列表。',
        spec: '180×180 PNG，留出 ~20% 安全边距。文件不超过 200 KB。',
      },
      {
        slot: 'icon192',
        label: 'Icon 192',
        publicPath: '/images/icon-192.png',
        accept: '.png',
        maxBytes: 100 * 1024,
        purpose: 'Web App Manifest 中 192×192 条目，用于 Android 主屏与 PWA 启动器。',
        spec: '192×192 PNG，背景透明或与品牌色一致。',
      },
      {
        slot: 'icon512',
        label: 'Icon 512',
        publicPath: '/images/icon-512.png',
        accept: '.png',
        maxBytes: 300 * 1024,
        purpose: 'Web App Manifest 中 512×512 条目，PWA 启动画面与高分辨率主屏使用。',
        spec: '512×512 PNG，文件不超过 300 KB。',
      },
    ],
  },
  {
    title: '站点 Logo',
    description:
      '页头、登录页、关于页使用的站点 Logo。提供浅色 / 暗色两套以适配主题切换，提供常规 / 大版以适配不同布局。',
    slots: [
      {
        slot: 'logoSvg',
        label: 'Logo SVG（浅色主题）',
        publicPath: '/logo.svg',
        accept: '.svg',
        maxBytes: 100 * 1024,
        purpose: '浅色主题下页头展示的站点 Logo。',
        spec: 'SVG 矢量，建议高度 ~32px 可读，无内嵌位图。',
      },
      {
        slot: 'logoDarkSvg',
        label: 'Logo SVG（暗色主题）',
        publicPath: '/logo-dark.svg',
        accept: '.svg',
        maxBytes: 100 * 1024,
        purpose: '暗色主题下页头展示的站点 Logo（颜色反转或加描边版本）。',
        spec: 'SVG 矢量，与浅色版宽高保持一致。',
        darkPreview: true,
      },
      {
        slot: 'logoLargeSvg',
        label: 'Logo Large SVG（浅色主题）',
        publicPath: '/logo-large.svg',
        accept: '.svg',
        maxBytes: 200 * 1024,
        purpose: '登录页 / 关于页等需要醒目展示的位置使用的大尺寸 Logo（浅色版）。',
        spec: 'SVG 矢量，可包含完整的品牌名 + 图标横排版式。',
      },
      {
        slot: 'logoLargeDarkSvg',
        label: 'Logo Large SVG（暗色主题）',
        publicPath: '/logo-large-dark.svg',
        accept: '.svg',
        maxBytes: 200 * 1024,
        purpose: '大尺寸 Logo 的暗色主题版本。',
        spec: 'SVG 矢量，与浅色大版宽高保持一致。',
        darkPreview: true,
      },
    ],
  },
  {
    title: '社交卡片与海报',
    description: '社交分享、首页装饰使用的位图素材。需要在 1200×630 这样的固定比例下保持清晰，因此用 PNG 而非 SVG。',
    slots: [
      {
        slot: 'openGraph',
        label: 'Open Graph 图片',
        publicPath: '/images/open-graph.png',
        accept: '.png',
        maxBytes: 600 * 1024,
        purpose: '当文章自己没有封面时，社交平台（Twitter/X、Telegram、微信等）抓取的分享卡片图。',
        spec: '1200×630 PNG，覆盖站点标识 + 品牌色，文件不超过 600 KB。',
      },
      {
        slot: 'blogPoster',
        label: '博客海报（浅色主题）',
        publicPath: '/images/blog-poster.png',
        accept: '.png',
        maxBytes: 600 * 1024,
        purpose: '首页顶部大幅装饰位（浅色主题），用于强化品牌识别。',
        spec: '建议 1600×900 PNG，需考虑首屏裁切。',
      },
      {
        slot: 'blogPosterDark',
        label: '博客海报（暗色主题）',
        publicPath: '/images/blog-poster-dark.png',
        accept: '.png',
        maxBytes: 600 * 1024,
        purpose: '首页顶部大幅装饰位的暗色主题版本。',
        spec: '与浅色版同尺寸，保证主题切换时不重排版面。',
        darkPreview: true,
      },
    ],
  },
  {
    title: '通用素材',
    description: '其他需要被站点回退到的图片资源。',
    slots: [
      {
        slot: 'defaultAvatar',
        label: '默认头像',
        publicPath: '/images/default-avatar.png',
        accept: '.png',
        maxBytes: 100 * 1024,
        purpose: '匿名评论者、没有上传头像的注册用户使用的回退头像。',
        spec: '正方形 PNG，建议 256×256，文件不超过 100 KB。',
      },
    ],
  },
]

interface BrandingViewProps {
  branding: AssetsLoaderShape['branding'] | null
  storageEnabled: boolean
}

export function BrandingView({ branding, storageEnabled }: BrandingViewProps) {
  return (
    <AdminListPage>
      <AdminListPage.Header
        title="品牌素材"
        description="集中管理 favicon、Logo、社交卡片与海报等站点品牌素材。所有文件直接写入 S3，公开 URL 与默认资源一致。"
      />

      {!storageEnabled ? (
        <div className="rounded-xl border border-status-warn-border/30 bg-status-warn-bg/50 p-4 text-sm text-status-warn-fg">
          当前未启用 S3 上传，所有上传 / 清除入口将返回 503。请先到{' '}
          <a className="underline underline-offset-2" href="/admin/settings#assets">
            系统设置 → 资源
          </a>{' '}
          打开「启用 S3 上传」并填写凭据。
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {SLOT_GROUPS.map((group) => (
          <SlotGroupCard key={group.title} group={group} branding={branding} storageEnabled={storageEnabled} />
        ))}
      </div>
    </AdminListPage>
  )
}

function SlotGroupCard({
  group,
  branding,
  storageEnabled,
}: {
  group: SlotGroup
  branding: AssetsLoaderShape['branding'] | null
  storageEnabled: boolean
}) {
  return (
    <section>
      <header className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
      </header>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {group.slots.map((meta) => (
            <SlotRow
              key={meta.slot}
              meta={meta}
              status={branding?.[meta.slot] ?? { etag: '' }}
              storageEnabled={storageEnabled}
            />
          ))}
        </CardContent>
      </Card>
    </section>
  )
}

function SlotRow({
  meta,
  status,
  storageEnabled,
}: {
  meta: SlotMeta
  status: BrandingSlotStatus
  storageEnabled: boolean
}) {
  const revalidator = useRevalidator()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<'upload' | 'clear' | null>(null)
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken

  const configured = status.etag !== ''
  const previewUrl = configured ? `${meta.publicPath}?v=${status.etag}` : meta.publicPath

  const handleUpload = useCallback(
    async (file: File) => {
      const expectedExt = meta.accept.replace('.', '')
      if (!file.name.toLowerCase().endsWith(`.${expectedExt}`)) {
        toast.error('文件类型错误', { description: `请选择 ${meta.accept} 格式的文件` })
        return
      }
      if (file.size > meta.maxBytes) {
        toast.error(`文件过大（${(file.size / 1024).toFixed(0)} KB）`, {
          description: `${meta.label} 大小上限为 ${(meta.maxBytes / 1024).toFixed(0)} KB。`,
        })
        return
      }
      setPending('upload')
      try {
        const formData = new FormData()
        formData.append('slot', meta.slot)
        formData.append('file', file)
        const headers: Record<string, string> = {}
        if (csrfToken) {
          headers['x-csrf-token'] = csrfToken
        }
        const res = await fetch('/api/admin/branding/upload', { method: 'POST', body: formData, headers })
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => null)
          const message = extractApiErrorMessage(data)
          throw new Error(message ?? `上传失败 (${res.status})`)
        }
        toast.success(`${meta.label} 已上传`)
        await revalidator.revalidate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '上传失败')
      } finally {
        setPending(null)
      }
    },
    [csrfToken, meta, revalidator],
  )

  const handleClear = useCallback(async () => {
    setPending('clear')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken
      }
      const res = await fetch('/api/admin/branding/clear', {
        method: 'POST',
        headers,
        body: JSON.stringify({ slot: meta.slot }),
      })
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null)
        const message = extractApiErrorMessage(data)
        throw new Error(message ?? `清除失败 (${res.status})`)
      }
      toast.success(`${meta.label} 已清除`)
      await revalidator.revalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清除失败')
    } finally {
      setPending(null)
    }
  }, [csrfToken, meta, revalidator])

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded border p-2 sm:size-24',
          meta.darkPreview ? 'border-line-muted bg-surface-secondary' : 'bg-muted/40',
        )}
      >
        <img src={previewUrl} alt={meta.label} loading="lazy" className="max-h-20 max-w-full object-contain" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">{meta.label}</h3>
          <code className="text-xs text-muted-foreground">{meta.publicPath}</code>
          <span className={cn('text-xs', configured ? 'text-status-ok-fg' : 'text-muted-foreground')}>
            {configured ? '已自定义' : '使用默认'}
          </span>
        </div>
        <p className="text-sm text-foreground/90">{meta.purpose}</p>
        <p className="text-xs text-muted-foreground">{meta.spec}</p>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
        <input
          ref={fileInputRef}
          type="file"
          accept={meta.accept}
          aria-label={`选择 ${meta.label}`}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              void handleUpload(f)
            }
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="default"
          className="w-full"
          disabled={!storageEnabled || pending !== null}
          onClick={() => fileInputRef.current?.click()}
        >
          {pending === 'upload' ? '上传中…' : configured ? '替换' : '上传'}
        </Button>
        {configured ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending !== null}
            onClick={() => void handleClear()}
          >
            {pending === 'clear' ? '清除中…' : '清除'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
