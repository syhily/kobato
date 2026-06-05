import type { SeoSettings } from '@/shared/config/types'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Input } from '@/ui/components/input'

interface SeoFormProps {
  seo: SeoSettings
}

function SeoTocCard({ seo }: { seo: SeoSettings }) {
  const { form, settingGroupProps } = useSettingsCard<SeoSettings, { tocMin: number; tocMax: number }>({
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
    <SettingGroup title="目录 (TOC)" description="文章右侧目录的标题层级范围。" {...settingGroupProps}>
      <SettingGroupContent>
        <SettingsRow label="最浅级别" htmlFor="seo-toc-min" hint="只显示比这个级别更深的标题。1 表示包含 h1。">
          <Input id="seo-toc-min" type="number" min={1} max={6} {...form.register('tocMin', { valueAsNumber: true })} />
        </SettingsRow>
        <SettingsRow label="最深级别" htmlFor="seo-toc-max" hint="超过该级别的标题不计入目录。">
          <Input id="seo-toc-max" type="number" min={1} max={6} {...form.register('tocMax', { valueAsNumber: true })} />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function SeoOgCard({ seo }: { seo: SeoSettings }) {
  const { form, settingGroupProps } = useSettingsCard<SeoSettings, { ogWidth: number; ogHeight: number }>({
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
      title="OG 图渲染尺寸"
      description="服务端 Canvas 用以下尺寸生成 /images/og/:slug.png 并写入 og:image:width / og:image:height meta。修改后会立即影响新生成的图片，已缓存的图片需手动清理。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label="宽度 (px)"
          htmlFor="seo-og-width"
          hint="600–4096，建议 ≥1200 以满足 X / Facebook 卡片清晰度。"
        >
          <Input
            id="seo-og-width"
            type="number"
            min={600}
            max={4096}
            {...form.register('ogWidth', { valueAsNumber: true })}
          />
        </SettingsRow>
        <SettingsRow label="高度 (px)" htmlFor="seo-og-height" hint="315–4096，常见 1.91:1 比例对应 1200×630。">
          <Input
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
