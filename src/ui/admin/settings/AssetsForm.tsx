import { Controller } from 'react-hook-form'

import type { AssetsLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput, SettingsTextarea } from '@/ui/admin/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@/ui/admin/settings/shell/SettingsSecretInput'
import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

interface AssetsFormProps {
  assets: AssetsLoaderShape
}

const SCHEME_OPTIONS: { value: 'http' | 'https'; label: string }[] = [
  { value: 'https', label: 'https' },
  { value: 'http', label: 'http' },
]

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

function AssetsToggleCard({ assets }: { assets: AssetsLoaderShape }) {
  const { form, settingGroupProps, save } = useSettingsCard<AssetsLoaderShape, { enabled: boolean }>({
    section: 'assets',
    source: assets,
    toState: (source) => ({ enabled: source.storage.enabled }),
    fromState: (state) => ({
      storage: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title="启用图片上传"
      description="未开启时「图片管理」与「品牌素材」页面只能浏览，所有上传 / 替换入口都会返回 503。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="启用 S3 上传" hint="关闭后已经入库的图片仍按上方的资源域名解析。">
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="assets-storage-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="assets-storage-enabled" className="font-normal">
                  {field.value ? '已开启' : '已关闭'}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function AssetsS3Card({ assets }: { assets: AssetsLoaderShape }) {
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
    emptyHint: '尚未配置。将以明文存入 setting 表。',
    emptyPlaceholder: '粘贴 Secret Access Key',
  })
  return (
    <SettingGroup
      title="S3 兼容存储"
      description="所有上传到「图片管理」与「品牌素材」的文件都会写入这里。修改后立即生效。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="Endpoint" htmlFor="assets-endpoint" hint="完整 URL，例如 https://s3.amazonaws.com。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-endpoint"
            type="url"
            placeholder="https://s3.amazonaws.com"
            {...form.register('endpoint')}
          />
        </SettingsRow>
        <SettingsRow label="Region" htmlFor="assets-region" hint="例：us-east-1 / auto（R2 / B2）。">
          <SettingsInput flushOnBlur={flushOnBlur} id="assets-region" maxLength={60} {...form.register('region')} />
        </SettingsRow>
        <SettingsRow label="Bucket" htmlFor="assets-bucket">
          <SettingsInput flushOnBlur={flushOnBlur} id="assets-bucket" maxLength={120} {...form.register('bucket')} />
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

function AssetsUploadCard({ assets }: { assets: AssetsLoaderShape }) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<
    AssetsLoaderShape,
    { maxBytes: number; jpegQuality: number }
  >({
    section: 'assets',
    source: assets,
    toState: (source) => ({
      maxBytes: source.upload.maxBytes,
      jpegQuality: source.upload.jpegQuality,
    }),
    fromState: (state) => ({
      upload: { maxBytes: state.maxBytes, jpegQuality: state.jpegQuality },
    }),
  })

  return (
    <SettingGroup
      title="上传参数"
      description="影响后台「图片管理」上传时的体积上限与 JPEG 重编码画质。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="最大上传体积（字节）"
          htmlFor="assets-max-bytes"
          hint="默认建议 8 MiB（8388608）。最大 50 MiB。"
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-max-bytes"
            type="number"
            min={1024}
            max={50 * 1024 * 1024}
            {...form.register('maxBytes', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="默认 JPEG 质量" htmlFor="assets-jpeg-quality" hint="40-100 之间。">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="assets-jpeg-quality"
            type="number"
            min={40}
            max={100}
            {...form.register('jpegQuality', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

// `robots.txt` is plain config text, so it stays on the settings PATCH; brand assets live elsewhere.
function AssetsRobotsTxtCard({ assets }: { assets: AssetsLoaderShape }) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<AssetsLoaderShape, { robotsTxt: string }>({
    section: 'assets',
    source: assets,
    toState: (source) => ({ robotsTxt: source.branding.robotsTxt }),
    fromState: (state) => ({ branding: { robotsTxt: state.robotsTxt } }),
  })

  return (
    <SettingGroup
      title="robots.txt"
      description="爬虫规则。留空时由网站地址自动生成包含 Sitemap 行的默认值。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="robots.txt 内容" htmlFor="assets-robots-txt">
          <SettingsTextarea
            flushOnBlur={flushOnBlur}
            id="assets-robots-txt"
            aria-label="robots.txt 内容"
            rows={6}
            value={form.watch('robotsTxt')}
            onChange={(e) => form.setValue('robotsTxt', e.target.value, { shouldDirty: true })}
            placeholder="留空则使用默认规则"
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function AssetsForm({ assets }: AssetsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <AssetsDomainCard assets={assets} />
      <AssetsToggleCard assets={assets} />
      <AssetsS3Card assets={assets} />
      <AssetsUploadCard assets={assets} />
      <AssetsRobotsTxtCard assets={assets} />
    </div>
  )
}
