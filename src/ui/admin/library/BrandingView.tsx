import { useCallback, useRef, useState } from 'react'
import { useRevalidator, useRouteLoaderData } from 'react-router'
import { toast } from 'sonner'

import type { AssetsLoaderShape, BrandingSlotStatus } from '@/shared/config/projection'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { useFileUpload } from '@/client/hooks/use-file-upload'
import { toastApiError } from '@/client/lib/toast-api-error'
import { formatNumber } from '@/shared/i18n/format'
import { extractApiErrorMessage } from '@/shared/utils/api-error'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { Button } from '@/ui/components/button'
import { Card, CardContent } from '@/ui/components/card'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

// Per-slot UI metadata: `publicPath` mirrors the server-side `ASSET_ROUTES` table.
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
  labelId: UiMessageId
  publicPath: string
  accept: '.svg' | '.ico' | '.png'
  maxBytes: number
  purposeId: UiMessageId
  specId: UiMessageId
  /** Render the preview thumbnail on a dark background — for dark-theme assets. */
  darkPreview?: boolean
}

interface SlotGroup {
  titleId: UiMessageId
  descriptionId: UiMessageId
  slots: SlotMeta[]
}

const SLOT_GROUPS: readonly SlotGroup[] = [
  {
    titleId: 'admin.branding.group.favicon.title',
    descriptionId: 'admin.branding.group.favicon.description',
    slots: [
      {
        slot: 'faviconSvg',
        labelId: 'admin.branding.slot.faviconSvg.label',
        publicPath: '/favicon.svg',
        accept: '.svg',
        maxBytes: 50 * 1024,
        purposeId: 'admin.branding.slot.faviconSvg.purpose',
        specId: 'admin.branding.slot.faviconSvg.spec',
      },
      {
        slot: 'faviconIco',
        labelId: 'admin.branding.slot.faviconIco.label',
        publicPath: '/favicon.ico',
        accept: '.ico',
        maxBytes: 100 * 1024,
        purposeId: 'admin.branding.slot.faviconIco.purpose',
        specId: 'admin.branding.slot.faviconIco.spec',
      },
      {
        slot: 'appleTouchIcon',
        labelId: 'admin.branding.slot.appleTouchIcon.label',
        publicPath: '/apple-touch-icon.png',
        accept: '.png',
        maxBytes: 200 * 1024,
        purposeId: 'admin.branding.slot.appleTouchIcon.purpose',
        specId: 'admin.branding.slot.appleTouchIcon.spec',
      },
      {
        slot: 'icon192',
        labelId: 'admin.branding.slot.icon192.label',
        publicPath: '/images/icon-192.png',
        accept: '.png',
        maxBytes: 100 * 1024,
        purposeId: 'admin.branding.slot.icon192.purpose',
        specId: 'admin.branding.slot.icon192.spec',
      },
      {
        slot: 'icon512',
        labelId: 'admin.branding.slot.icon512.label',
        publicPath: '/images/icon-512.png',
        accept: '.png',
        maxBytes: 300 * 1024,
        purposeId: 'admin.branding.slot.icon512.purpose',
        specId: 'admin.branding.slot.icon512.spec',
      },
    ],
  },
  {
    titleId: 'admin.branding.group.logo.title',
    descriptionId: 'admin.branding.group.logo.description',
    slots: [
      {
        slot: 'logoSvg',
        labelId: 'admin.branding.slot.logoSvg.label',
        publicPath: '/logo.svg',
        accept: '.svg',
        maxBytes: 100 * 1024,
        purposeId: 'admin.branding.slot.logoSvg.purpose',
        specId: 'admin.branding.slot.logoSvg.spec',
      },
      {
        slot: 'logoDarkSvg',
        labelId: 'admin.branding.slot.logoDarkSvg.label',
        publicPath: '/logo-dark.svg',
        accept: '.svg',
        maxBytes: 100 * 1024,
        purposeId: 'admin.branding.slot.logoDarkSvg.purpose',
        specId: 'admin.branding.slot.logoDarkSvg.spec',
        darkPreview: true,
      },
      {
        slot: 'logoLargeSvg',
        labelId: 'admin.branding.slot.logoLargeSvg.label',
        publicPath: '/logo-large.svg',
        accept: '.svg',
        maxBytes: 200 * 1024,
        purposeId: 'admin.branding.slot.logoLargeSvg.purpose',
        specId: 'admin.branding.slot.logoLargeSvg.spec',
      },
      {
        slot: 'logoLargeDarkSvg',
        labelId: 'admin.branding.slot.logoLargeDarkSvg.label',
        publicPath: '/logo-large-dark.svg',
        accept: '.svg',
        maxBytes: 200 * 1024,
        purposeId: 'admin.branding.slot.logoLargeDarkSvg.purpose',
        specId: 'admin.branding.slot.logoLargeDarkSvg.spec',
        darkPreview: true,
      },
    ],
  },
  {
    titleId: 'admin.branding.group.social.title',
    descriptionId: 'admin.branding.group.social.description',
    slots: [
      {
        slot: 'openGraph',
        labelId: 'admin.branding.slot.openGraph.label',
        publicPath: '/images/open-graph.png',
        accept: '.png',
        maxBytes: 600 * 1024,
        purposeId: 'admin.branding.slot.openGraph.purpose',
        specId: 'admin.branding.slot.openGraph.spec',
      },
      {
        slot: 'blogPoster',
        labelId: 'admin.branding.slot.blogPoster.label',
        publicPath: '/images/blog-poster.png',
        accept: '.png',
        maxBytes: 600 * 1024,
        purposeId: 'admin.branding.slot.blogPoster.purpose',
        specId: 'admin.branding.slot.blogPoster.spec',
      },
      {
        slot: 'blogPosterDark',
        labelId: 'admin.branding.slot.blogPosterDark.label',
        publicPath: '/images/blog-poster-dark.png',
        accept: '.png',
        maxBytes: 600 * 1024,
        purposeId: 'admin.branding.slot.blogPosterDark.purpose',
        specId: 'admin.branding.slot.blogPosterDark.spec',
        darkPreview: true,
      },
    ],
  },
  {
    titleId: 'admin.branding.group.misc.title',
    descriptionId: 'admin.branding.group.misc.description',
    slots: [
      {
        slot: 'defaultAvatar',
        labelId: 'admin.branding.slot.defaultAvatar.label',
        publicPath: '/images/default-avatar.png',
        accept: '.png',
        maxBytes: 100 * 1024,
        purposeId: 'admin.branding.slot.defaultAvatar.purpose',
        specId: 'admin.branding.slot.defaultAvatar.spec',
      },
    ],
  },
]

interface BrandingViewProps {
  branding: AssetsLoaderShape['branding'] | null
}

export function BrandingView({ branding }: BrandingViewProps) {
  const { t } = useI18n()
  return (
    <AdminListPage>
      <AdminListPage.Header title={t('admin.branding.title')} description={t('admin.branding.description')} />

      <div className="flex flex-col gap-8">
        {SLOT_GROUPS.map((group) => (
          <SlotGroupCard key={group.titleId} group={group} branding={branding} />
        ))}
      </div>
    </AdminListPage>
  )
}

function SlotGroupCard({ group, branding }: { group: SlotGroup; branding: AssetsLoaderShape['branding'] | null }) {
  const { t } = useI18n()
  return (
    <section>
      <header className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">{t(group.titleId)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(group.descriptionId)}</p>
      </header>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {group.slots.map((meta) => (
            <SlotRow key={meta.slot} meta={meta} status={branding?.[meta.slot] ?? { etag: '' }} />
          ))}
        </CardContent>
      </Card>
    </section>
  )
}

function SlotRow({ meta, status }: { meta: SlotMeta; status: BrandingSlotStatus }) {
  const revalidator = useRevalidator()
  const { locale, t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [clearing, setClearing] = useState(false)
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken

  const configured = status.etag !== ''
  const previewUrl = configured ? `${meta.publicPath}?v=${status.etag}` : meta.publicPath

  const { upload, pending } = useFileUpload({
    endpoint: '/api/admin/branding/upload',
    t,
    fields: { slot: meta.slot },
    accept: [meta.accept],
    maxBytes: meta.maxBytes,
    messages: {
      invalidType: {
        title: t('admin.toast.invalidFileType'),
        description: t('admin.branding.invalidTypeDescription', { accept: meta.accept }),
      },
      tooLarge: (file) => ({
        title: t('admin.branding.tooLargeTitle', {
          size: formatNumber(file.size / 1024, {
            locale,
            style: 'unit',
            unit: 'kilobyte',
            unitDisplay: 'short',
            maximumFractionDigits: 0,
          }),
        }),
        description: t('admin.branding.tooLargeDescription', {
          label: t(meta.labelId),
          limit: formatNumber(meta.maxBytes / 1024, {
            locale,
            style: 'unit',
            unit: 'kilobyte',
            unitDisplay: 'short',
            maximumFractionDigits: 0,
          }),
        }),
      }),
      success: t('admin.branding.uploaded', { label: t(meta.labelId) }),
    },
    onSuccess: () => revalidator.revalidate(),
  })

  const handleClear = useCallback(async () => {
    setClearing(true)
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
        toastApiError(
          new Error(message ?? t('admin.branding.clearFailed', { status: res.status })),
          'admin.toast.clearFailed',
          t,
        )
      } else {
        toast.success(t('admin.branding.cleared', { label: t(meta.labelId) }))
        await revalidator.revalidate()
      }
    } catch (err) {
      toastApiError(err, 'admin.toast.clearFailed', t)
    }
    // React Compiler can't lower try/finally — the pending reset runs after the catch instead.
    setClearing(false)
  }, [csrfToken, meta, revalidator, t])

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded border p-2 sm:size-24',
          meta.darkPreview ? 'border-line-muted bg-surface-secondary' : 'bg-muted/40',
        )}
      >
        <img src={previewUrl} alt={t(meta.labelId)} loading="lazy" className="max-h-20 max-w-full object-contain" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">{t(meta.labelId)}</h3>
          <code className="text-xs text-muted-foreground">{meta.publicPath}</code>
          <span className={cn('text-xs', configured ? 'text-status-ok-fg' : 'text-muted-foreground')}>
            {configured ? t('admin.branding.customized') : t('admin.branding.default')}
          </span>
        </div>
        <p className="text-sm text-foreground/90">{t(meta.purposeId)}</p>
        <p className="text-xs text-muted-foreground">{t(meta.specId)}</p>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
        <input
          ref={fileInputRef}
          type="file"
          accept={meta.accept}
          aria-label={t('admin.branding.chooseAria', { label: t(meta.labelId) })}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              void upload(f)
            }
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="default"
          className="w-full"
          disabled={pending || clearing}
          onClick={() => fileInputRef.current?.click()}
        >
          {pending
            ? t('admin.shared.upload.uploading')
            : configured
              ? t('admin.branding.replace')
              : t('admin.shared.upload.submit')}
        </Button>
        {configured ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending || clearing}
            onClick={() => void handleClear()}
          >
            {clearing ? t('admin.branding.clearing') : t('admin.branding.clear')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
