import type { AssetsLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput, SettingsTextarea } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'

interface AssetsFormProps {
  assets: AssetsLoaderShape
}

// 资源域名 / S3 存储 / 存储迁移 live on `/admin/library/storage`; this form keeps
// only the upload limits and robots.txt.
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
      <AssetsUploadCard assets={assets} />
      <AssetsRobotsTxtCard assets={assets} />
    </div>
  )
}
