import type { SeoSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { useI18n } from '@/ui/lib/I18nProvider'

interface SeoFormProps {
  seo: SeoSettings
}

function SeoTocCard({ seo }: { seo: SeoSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<SeoSettings, { tocMin: number; tocMax: number }>({
    section: 'seo',
    source: seo,
    toState: (source) => ({
      tocMin: source.toc.minHeadingLevel,
      tocMax: source.toc.maxHeadingLevel,
    }),
    fromState: (state) => ({
      toc: { minHeadingLevel: state.tocMin, maxHeadingLevel: state.tocMax },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.seo.toc.title')}
      description={t('admin.settings.seo.toc.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.seo.toc.min')}
          htmlFor="seo-toc-min"
          hint={t('admin.settings.seo.toc.minHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="seo-toc-min"
            type="number"
            min={1}
            max={6}
            {...form.register('tocMin', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.seo.toc.max')}
          htmlFor="seo-toc-max"
          hint={t('admin.settings.seo.toc.maxHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="seo-toc-max"
            type="number"
            min={1}
            max={6}
            {...form.register('tocMax', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function SeoOgCard({ seo }: { seo: SeoSettings }) {
  const { t } = useI18n()
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<SeoSettings, { ogWidth: number; ogHeight: number }>({
    section: 'seo',
    source: seo,
    toState: (source) => ({
      ogWidth: source.og.width,
      ogHeight: source.og.height,
    }),
    fromState: (state) => ({
      og: { width: state.ogWidth, height: state.ogHeight },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.seo.og.title')}
      description={t('admin.settings.seo.og.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.seo.og.width')}
          htmlFor="seo-og-width"
          hint={t('admin.settings.seo.og.widthHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="seo-og-width"
            type="number"
            min={600}
            max={4096}
            {...form.register('ogWidth', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.seo.og.height')}
          htmlFor="seo-og-height"
          hint={t('admin.settings.seo.og.heightHint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="seo-og-height"
            type="number"
            min={315}
            max={4096}
            {...form.register('ogHeight', { valueAsNumber: true })}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function SeoForm({ seo }: SeoFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <SeoTocCard seo={seo} />
      <SeoOgCard seo={seo} />
    </div>
  )
}
