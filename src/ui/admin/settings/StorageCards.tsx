import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeftIcon } from 'lucide-react'
import { useState } from 'react'
import { Controller } from 'react-hook-form'

import type { AssetsLoaderShape } from '@/shared/config/projection'

import { orpcQuery } from '@/client/api/orpc-query'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@/ui/admin/settings/shell/SettingsSecretInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { StorageMigrationCard } from '@/ui/admin/settings/StorageMigrationCard'
import { StorageMigrationDialog } from '@/ui/admin/settings/StorageMigrationDialog'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { useI18n } from '@/ui/lib/I18nProvider'

interface StorageCardsProps {
  assets: AssetsLoaderShape
}

const SCHEME_OPTIONS: { value: 'http' | 'https'; label: string }[] = [
  { value: 'https', label: 'https' },
  { value: 'http', label: 'http' },
]

// Storage backend config + migration management. Lives outside the settings
// autosave framework: the S3 config is locked once enabled and every backend
// switch runs through the migration task (`admin.storage.*`).
export function StorageCards({ assets }: StorageCardsProps) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const { data: stats } = useQuery(orpcQuery.admin.storage.stats.queryOptions({ input: {} }))
  const s3Primary = stats?.s3Primary ?? assets.storage.enabled

  return (
    <>
      <StorageStatusCard assets={assets} s3Primary={s3Primary} onOpenWizard={() => setWizardOpen(true)} />
      <StorageMigrationCard />
      <AssetsDomainCard assets={assets} />
      <S3ConfigCard assets={assets} />
      <StorageMigrationDialog open={wizardOpen} onOpenChange={setWizardOpen} s3Primary={s3Primary} />
    </>
  )
}

function StorageStatusCard({
  assets,
  s3Primary,
  onOpenWizard,
}: {
  assets: AssetsLoaderShape
  s3Primary: boolean
  onOpenWizard: () => void
}) {
  const { t } = useI18n()
  const { data: stats } = useQuery(orpcQuery.admin.storage.stats.queryOptions({ input: {} }))
  const localTotal = stats == null ? null : stats.images + stats.music + stats.branding + stats.backups

  return (
    <SettingGroup
      title={t('admin.settings.storage.current.title')}
      description={t('admin.settings.storage.current.description')}
      actions={
        <Button variant="outline" size="sm" onClick={onOpenWizard}>
          <ArrowRightLeftIcon data-icon />
          {t('admin.settings.storage.current.migrate')}
        </Button>
      }
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.storage.current.primary')}>
          <p className="text-sm">
            {s3Primary ? (
              <>
                S3 · <span className="font-medium">{assets.storage.bucket}</span>
                <span className="ml-2 text-muted-foreground">{assets.storage.endpoint}</span>
              </>
            ) : (
              t('admin.settings.storage.current.local')
            )}
          </p>
        </SettingsRow>
        {localTotal !== null && localTotal > 0 ? (
          <SettingsRow label={t('admin.settings.storage.current.localFiles')}>
            <p className="text-sm text-muted-foreground">
              {t('admin.settings.storage.current.localFilesDetail', {
                images: stats?.images ?? 0,
                music: stats?.music ?? 0,
                branding: stats?.branding ?? 0,
                backups: stats?.backups ?? 0,
              })}
            </p>
          </SettingsRow>
        ) : null}
      </SettingGroupContent>
    </SettingGroup>
  )
}

function AssetsDomainCard({ assets }: { assets: AssetsLoaderShape }) {
  const { t } = useI18n()
  const { form, settingGroupProps, save, flushOnBlur } = useSettingsCard<
    AssetsLoaderShape,
    { assetHost: string; assetScheme: 'http' | 'https' }
  >({
    section: 'assets',
    source: assets,
    toState: (source) => ({
      assetHost: source.asset.host,
      assetScheme: source.asset.scheme,
    }),
    fromState: (state) => ({
      asset: { host: state.assetHost.trim(), scheme: state.assetScheme },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.storage.domain.title')}
      description={t('admin.settings.storage.domain.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.storage.domain.scheme')} htmlFor="assets-asset-scheme">
          <Controller
            control={form.control}
            name="assetScheme"
            render={({ field }) => (
              <SettingsSelect name={field.name} value={field.value} onValueChange={field.onChange} save={save}>
                <SelectTrigger id="assets-asset-scheme" className="w-full">
                  <SelectValue>
                    {(value: string | null) => SCHEME_OPTIONS.find((o) => o.value === value)?.label ?? value ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SCHEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SettingsSelect>
            )}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.storage.domain.host')}
          htmlFor="assets-asset-host"
          hint={t('admin.settings.storage.domain.hostHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-asset-host"
            maxLength={253}
            placeholder={t('admin.settings.storage.domain.hostPlaceholder')}
            {...form.register('assetHost')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function S3ConfigCard({ assets }: { assets: AssetsLoaderShape }) {
  const { t } = useI18n()
  const locked = assets.storage.enabled
  const { form, settingGroupProps, display, save, flushOnBlur } = useSettingsCard<
    AssetsLoaderShape,
    {
      endpoint: string
      region: string
      bucket: string
      accessKeyId: string
      secretAccessKey: string
      forcePathStyle: boolean
      urlTemplate: string
    }
  >({
    section: 'assets',
    source: assets,
    toState: (source) => ({
      endpoint: source.storage.endpoint,
      region: source.storage.region,
      bucket: source.storage.bucket,
      accessKeyId: source.storage.accessKeyId,
      secretAccessKey: '',
      forcePathStyle: source.storage.forcePathStyle,
      urlTemplate: source.storage.urlTemplate,
    }),
    fromState: (state) => ({
      storage: {
        endpoint: state.endpoint.trim(),
        region: state.region.trim(),
        bucket: state.bucket.trim(),
        accessKeyId: state.accessKeyId.trim(),
        forcePathStyle: state.forcePathStyle,
        urlTemplate: state.urlTemplate.trim(),
        ...secretFieldPatch(state.secretAccessKey, 'secretAccessKey'),
      },
    }),
  })

  const secretAccessKeyField = secretFieldStrings({
    t,
    mask: display.secretAccessKeyMask,
    keepLabel: t('admin.settings.storage.s3.keepSecret'),
    emptyHint: t('admin.settings.storage.s3.secretHintEmpty'),
    emptyPlaceholder: t('admin.settings.storage.s3.secretPlaceholder'),
  })
  return (
    <SettingGroup
      title={t('admin.settings.storage.s3.title')}
      description={
        locked ? t('admin.settings.storage.s3.descriptionLocked') : t('admin.settings.storage.s3.descriptionUnlocked')
      }
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.storage.s3.endpoint')}
          htmlFor="assets-endpoint"
          hint={t('admin.settings.storage.s3.endpointHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-endpoint"
            type="url"
            placeholder={t('admin.settings.storage.s3.endpointPlaceholder')}
            disabled={locked}
            {...form.register('endpoint')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.storage.s3.region')}
          htmlFor="assets-region"
          hint={t('admin.settings.storage.s3.regionHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-region"
            maxLength={60}
            disabled={locked}
            {...form.register('region')}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.storage.s3.bucket')} htmlFor="assets-bucket">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-bucket"
            maxLength={120}
            disabled={locked}
            {...form.register('bucket')}
          />
        </SettingsRow>
        <SettingsRow label={t('admin.settings.storage.s3.accessKey')} htmlFor="assets-access-key-id">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-access-key-id"
            maxLength={255}
            autoComplete="off"
            {...form.register('accessKeyId')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.storage.s3.secret')}
          htmlFor="assets-secret"
          hint={secretAccessKeyField.hint}
        >
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="assets-secret"
            placeholder={secretAccessKeyField.placeholder}
            {...form.register('secretAccessKey')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.storage.s3.pathStyle')}
          hint={t('admin.settings.storage.s3.pathStyleHint')}
        >
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="forcePathStyle"
              render={({ field }) => (
                <SettingsSwitch
                  name={field.name}
                  id="assets-force-path-style"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                  disabled={locked}
                />
              )}
            />
            <FieldLabel htmlFor="assets-force-path-style" className="font-normal">
              {t('admin.settings.storage.s3.pathStyleLabel')}
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.storage.s3.urlTemplate')}
          htmlFor="assets-url-template"
          hint={t('admin.settings.storage.s3.urlTemplateHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-url-template"
            {...form.register('urlTemplate')}
            maxLength={500}
            placeholder={t('admin.settings.storage.s3.urlTemplatePlaceholder')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
