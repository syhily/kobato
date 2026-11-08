import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCwIcon, UploadIcon } from 'lucide-react'
import { useRef } from 'react'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'

import type { AnalyticsSettings } from '@/shared/config/types'
import type { AppLocale } from '@/shared/i18n/locales'

import { orpcQuery } from '@/client/api/orpc-query'
import { useFileUpload } from '@/client/hooks/use-file-upload'
import { onMutationError } from '@/client/lib/toast-api-error'
import { formatDateTime } from '@/shared/i18n/format'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { type I18nValue, useI18n } from '@/ui/lib/I18nProvider'

interface AnalyticsFormProps {
  analytics: AnalyticsSettings
}

interface GeoipStatus {
  installed: boolean
  version: string | null
  source: 'upload' | 'remote' | null
  updatedAt: string | null
}

function geoipStatusKey() {
  return orpcQuery.admin.geoip.status.key()
}

function MaxMindUploadRow() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const { upload, pending } = useFileUpload({
    endpoint: '/api/admin/maxmind/upload',
    t,
    accept: ['.mmdb'],
    maxBytes: 100 * 1024 * 1024,
    messages: {
      invalidType: {
        title: t('admin.settings.analytics.geoip.invalidTypeTitle'),
        description: t('admin.settings.analytics.geoip.invalidType'),
      },
      tooLarge: () => ({
        title: t('admin.settings.analytics.geoip.tooLargeTitle'),
        description: t('admin.settings.analytics.geoip.tooLarge'),
      }),
      success: t('admin.settings.analytics.geoip.uploadSuccess'),
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: geoipStatusKey() }),
  })

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mmdb"
        hidden
        aria-label={t('admin.settings.analytics.geoip.chooseFile')}
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
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon data-icon="sm" />
        {pending ? t('admin.settings.analytics.geoip.uploading') : t('admin.settings.analytics.geoip.upload')}
      </Button>
      <span className="text-sm text-muted-foreground">{t('admin.settings.analytics.geoip.uploadNote')}</span>
    </div>
  )
}

function describeGeoipStatus(
  status: GeoipStatus | undefined,
  options: { locale: AppLocale; timeZone: string; t: I18nValue['t'] },
): string {
  const { t } = options
  if (!status) {
    return t('admin.settings.analytics.geoip.statusLoading')
  }
  if (!status.installed) {
    return t('admin.settings.analytics.geoip.statusMissing')
  }
  const version = status.version ?? t('admin.settings.analytics.geoip.unknownVersion')
  const source =
    status.source === 'remote'
      ? t('admin.settings.analytics.geoip.sourceRemote')
      : t('admin.settings.analytics.geoip.sourceUpload')
  const updatedAt =
    status.updatedAt === null
      ? ''
      : t('admin.settings.analytics.geoip.updatedAt', {
          time: formatDateTime(new Date(status.updatedAt), {
            locale: options.locale,
            timeZone: options.timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        })
  return t('admin.settings.analytics.geoip.statusVersion', { version, source, updatedAt })
}

function MaxMindRemoteUpdateRow() {
  const queryClient = useQueryClient()
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
  const { data: status } = useQuery(orpcQuery.admin.geoip.status.queryOptions({ input: {} }))
  const updateMutation = useMutation({
    ...orpcQuery.admin.geoip.update.mutationOptions(),
    onSuccess: (result) => {
      if (result.status === 'updated') {
        toast.success(t('admin.settings.analytics.geoip.updated', { version: result.version }))
      } else {
        toast.success(t('admin.settings.analytics.geoip.upToDate', { version: result.version }))
      }
      void queryClient.invalidateQueries({ queryKey: geoipStatusKey() })
    },
    onError: onMutationError('admin.toast.geoipUpdateFailed', t),
  })

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={updateMutation.isPending}
        onClick={() => updateMutation.mutate({})}
      >
        <RefreshCwIcon data-icon="sm" />
        {updateMutation.isPending
          ? t('admin.settings.analytics.geoip.checking')
          : t('admin.settings.analytics.geoip.check')}
      </Button>
      <span className="text-sm text-muted-foreground">{describeGeoipStatus(status, { locale, timeZone, t })}</span>
    </div>
  )
}

export function AnalyticsForm({ analytics }: AnalyticsFormProps) {
  const { t } = useI18n()
  const { form, settingGroupProps, save } = useSettingsCard<
    AnalyticsSettings,
    { trackAdmin: boolean; keepBotRows: boolean; geoipAutoUpdate: boolean }
  >({
    section: 'analytics',
    source: analytics,
    toState: (source) => ({
      trackAdmin: source.analytics.trackAdmin,
      keepBotRows: source.analytics.keepBotRows,
      geoipAutoUpdate: source.analytics.geoipAutoUpdate,
    }),
    fromState: (state) => ({
      analytics: {
        trackAdmin: state.trackAdmin,
        keepBotRows: state.keepBotRows,
        geoipAutoUpdate: state.geoipAutoUpdate,
      },
    }),
  })

  return (
    <div className="flex flex-col gap-5">
      <SettingGroup
        title={t('admin.settings.analytics.collect.title')}
        description={t('admin.settings.analytics.collect.description')}
        {...settingGroupProps}
      >
        <SettingGroupContent>
          <SettingsRow
            label={t('admin.settings.analytics.trackAdmin')}
            hint={t('admin.settings.analytics.trackAdminHint')}
          >
            <Controller
              control={form.control}
              name="trackAdmin"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <SettingsSwitch
                    name={field.name}
                    id="analytics-track-admin"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    save={save}
                  />
                  <FieldLabel htmlFor="analytics-track-admin" className="font-normal">
                    {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
          <SettingsRow label={t('admin.settings.analytics.keepBots')} hint={t('admin.settings.analytics.keepBotsHint')}>
            <Controller
              control={form.control}
              name="keepBotRows"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <SettingsSwitch
                    name={field.name}
                    id="analytics-keep-bot-rows"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    save={save}
                  />
                  <FieldLabel htmlFor="analytics-keep-bot-rows" className="font-normal">
                    {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
        </SettingGroupContent>
      </SettingGroup>

      <SettingGroup
        title={t('admin.settings.analytics.geoip.title')}
        description={t('admin.settings.analytics.geoip.description')}
      >
        <SettingGroupContent>
          <SettingsRow label={t('admin.settings.analytics.geoip.file')}>
            <MaxMindUploadRow />
          </SettingsRow>
          <SettingsRow
            label={t('admin.settings.analytics.geoip.remoteUpdate')}
            hint={t('admin.settings.analytics.geoip.remoteUpdateHint')}
          >
            <MaxMindRemoteUpdateRow />
          </SettingsRow>
          <SettingsRow
            label={t('admin.settings.analytics.geoip.autoUpdate')}
            hint={t('admin.settings.analytics.geoip.autoUpdateHint')}
          >
            <Controller
              control={form.control}
              name="geoipAutoUpdate"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <SettingsSwitch
                    name={field.name}
                    id="analytics-geoip-auto-update"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    save={save}
                  />
                  <FieldLabel htmlFor="analytics-geoip-auto-update" className="font-normal">
                    {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                  </FieldLabel>
                </div>
              )}
            />
          </SettingsRow>
        </SettingGroupContent>
      </SettingGroup>
    </div>
  )
}
