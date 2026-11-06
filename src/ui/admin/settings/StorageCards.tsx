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
  const { data: stats } = useQuery(orpcQuery.admin.storage.stats.queryOptions({ input: {} }))
  const localTotal = stats == null ? null : stats.images + stats.music + stats.branding + stats.backups

  return (
    <SettingGroup
      title="当前存储"
      description="上传的文件写入当前主存储；历史对象按各自记录的驱动读取。更换存储会先把现有对象全部复制过去。"
      actions={
        <Button variant="outline" size="sm" onClick={onOpenWizard}>
          <ArrowRightLeftIcon data-icon />
          迁移存储…
        </Button>
      }
    >
      <SettingGroupContent>
        <SettingsRow label="主存储">
          <p className="text-sm">
            {s3Primary ? (
              <>
                S3 · <span className="font-medium">{assets.storage.bucket}</span>
                <span className="ml-2 text-muted-foreground">{assets.storage.endpoint}</span>
              </>
            ) : (
              '本地文件系统'
            )}
          </p>
        </SettingsRow>
        {localTotal !== null && localTotal > 0 ? (
          <SettingsRow label="本地存储中的文件">
            <p className="text-sm text-muted-foreground">
              图片 {stats?.images ?? 0} · 音乐 {stats?.music ?? 0} · 品牌素材 {stats?.branding ?? 0} · 备份{' '}
              {stats?.backups ?? 0}
            </p>
          </SettingsRow>
        ) : null}
      </SettingGroupContent>
    </SettingGroup>
  )
}

function AssetsDomainCard({ assets }: { assets: AssetsLoaderShape }) {
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
      title="资源域名"
      description="统一的资源域名：`<MusicPlayer>` 音乐块读取音频/歌词，图片公共 URL 也复用这里的 host + scheme。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="协议" htmlFor="assets-asset-scheme">
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
          label="域名"
          htmlFor="assets-asset-host"
          hint="只能包含字母 / 数字 / `-` / `.`，例如 `cat.example.com`。"
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-asset-host"
            maxLength={253}
            placeholder="cat.example.com"
            {...form.register('assetHost')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function S3ConfigCard({ assets }: { assets: AssetsLoaderShape }) {
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
    mask: display.secretAccessKeyMask,
    keepLabel: '保留现有 Secret',
    emptyHint: '尚未配置。将以加密形式存入 setting 表。',
    emptyPlaceholder: '粘贴 Secret Access Key',
  })
  return (
    <SettingGroup
      title="S3 兼容存储"
      description={
        locked
          ? 'S3 配置已锁定：仍可更换 Access Key / Secret 或图片地址模板（保存前会做连通性验证）；更换 Bucket 或服务商请点击上方「迁移存储…」。'
          : '保存前会做连通性验证；填入完整配置后通过「迁移存储…」启用。'
      }
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="Endpoint" htmlFor="assets-endpoint" hint="完整 URL，例如 https://s3.amazonaws.com。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-endpoint"
            type="url"
            placeholder="https://s3.amazonaws.com"
            disabled={locked}
            {...form.register('endpoint')}
          />
        </SettingsRow>
        <SettingsRow label="Region" htmlFor="assets-region" hint="例：us-east-1 / auto（R2 / B2）。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-region"
            maxLength={60}
            disabled={locked}
            {...form.register('region')}
          />
        </SettingsRow>
        <SettingsRow label="Bucket" htmlFor="assets-bucket">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-bucket"
            maxLength={120}
            disabled={locked}
            {...form.register('bucket')}
          />
        </SettingsRow>
        <SettingsRow label="Access Key ID" htmlFor="assets-access-key-id">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-access-key-id"
            maxLength={255}
            autoComplete="off"
            {...form.register('accessKeyId')}
          />
        </SettingsRow>
        <SettingsRow label="Secret Access Key" htmlFor="assets-secret" hint={secretAccessKeyField.hint}>
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="assets-secret"
            placeholder={secretAccessKeyField.placeholder}
            {...form.register('secretAccessKey')}
          />
        </SettingsRow>
        <SettingsRow label="Path-style 寻址" hint="部分自托管 S3 兼容服务需要开启；R2 / S3 默认走 virtual-hosted。">
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
              强制使用 path-style URL
            </FieldLabel>
          </div>
        </SettingsRow>
        <SettingsRow
          label="图片地址模板（可选）"
          htmlFor="assets-url-template"
          hint="支持 `{src}`、`{width}`、`{height}`、`{quality}` 占位符。"
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-url-template"
            {...form.register('urlTemplate')}
            maxLength={500}
            placeholder="!upyun520/both/{width}x{height}/format/webp/quality/{quality}/..."
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
