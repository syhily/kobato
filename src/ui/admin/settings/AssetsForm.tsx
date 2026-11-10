import { useWatch } from 'react-hook-form'

import type { AssetsLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput, SettingsTextarea } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { StorageCards } from '@/ui/admin/settings/StorageCards'
import { useI18n } from '@/ui/lib/I18nProvider'

interface AssetsFormProps {
  assets: AssetsLoaderShape
}

// Upload limits: the asset domain / S3 storage / storage migration live in `StorageCards` above.
function AssetsUploadCard({ assets }: { assets: AssetsLoaderShape }) {
  const { t } = useI18n()
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
      title={t('admin.settings.assets.upload.title')}
      description={t('admin.settings.assets.upload.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.assets.upload.maxBytes')}
          htmlFor="assets-max-bytes"
          hint={t('admin.settings.assets.upload.maxBytesHint')}
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
        <SettingsRow
          label={t('admin.settings.assets.upload.jpegQuality')}
          htmlFor="assets-jpeg-quality"
          hint={t('admin.settings.assets.upload.jpegQualityHint')}
        >
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
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<AssetsLoaderShape, { robotsTxt: string }>({
    section: 'assets',
    source: assets,
    toState: (source) => ({ robotsTxt: source.branding.robotsTxt }),
    fromState: (state) => ({ branding: { robotsTxt: state.robotsTxt } }),
  })
  // useWatch, not form.watch: the React Compiler memoizes render-time watch()
  // results (stable form dep), freezing the textarea at its initial content.
  const robotsTxt = useWatch({ control: form.control, name: 'robotsTxt' })

  return (
    <SettingGroup
      title={t('admin.settings.assets.robots.title')}
      description={t('admin.settings.assets.robots.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.assets.robots.content')} htmlFor="assets-robots-txt">
          <SettingsTextarea
            flushOnBlur={flushOnBlur}
            id="assets-robots-txt"
            aria-label={t('admin.settings.assets.robots.content')}
            rows={6}
            value={robotsTxt}
            onChange={(e) => form.setValue('robotsTxt', e.target.value, { shouldDirty: true })}
            placeholder={t('admin.settings.assets.robots.placeholder')}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function AssetsForm({ assets }: AssetsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <StorageCards assets={assets} />
      <AssetsUploadCard assets={assets} />
      <AssetsRobotsTxtCard assets={assets} />
    </div>
  )
}
