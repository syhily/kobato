import { useFieldArray, useWatch } from 'react-hook-form'

import type { SocialItem, SocialsSettings } from '@/shared/config/types'

import { type SocialNetwork, SOCIAL_NETWORKS, getSocialNetworkMeta } from '@/shared/config/socials'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Label } from '@/ui/components/label'
import { SOCIAL_NETWORK_ICONS } from '@/ui/icons/brand'

interface SocialsEditorProps {
  socials: SocialsSettings
}

interface SocialRow {
  network: SocialNetwork
  name: string
  title: string
  link: string
}

function toFormState(source: SocialsSettings): { rows: SocialRow[] } {
  const sourceMap = new Map(source.socials.map((s) => [s.network, s]))
  const rows: SocialRow[] = SOCIAL_NETWORKS.map((network) => {
    const item = sourceMap.get(network)
    const meta = getSocialNetworkMeta(network)
    if (item) {
      const customName = item.name && item.name !== meta.defaultName ? item.name : ''
      return { network, name: customName, title: item.title ?? '', link: item.link }
    }
    return { network, name: '', title: '', link: '' }
  })
  return { rows }
}

export function SocialsEditor({ socials }: SocialsEditorProps) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<SocialsSettings, { rows: SocialRow[] }>({
    section: 'socials',
    source: socials,
    toState: toFormState,
    fromState: (state) => ({
      socials: state.rows
        .filter((row) => row.link.trim() !== '')
        .map((row) => {
          const meta = getSocialNetworkMeta(row.network)
          const customName = row.name.trim()
          const item: SocialItem = {
            name: customName || meta.defaultName,
            network: row.network,
            type: meta.type,
            link: row.link.trim(),
          }
          if (meta.type === 'qrcode' && row.title.trim()) {
            item.title = row.title.trim()
          }
          return item
        }),
    }),
  })

  const { fields } = useFieldArray({ control: form.control, name: 'rows' })
  const rows = useWatch({ control: form.control, name: 'rows' })

  const patch = (index: number, update: Partial<SocialRow>) => {
    const current = form.getValues(`rows.${index}`)
    form.setValue(`rows.${index}`, { ...current, ...update }, { shouldDirty: true })
  }

  return (
    <SettingGroup
      title="社交链接"
      description="配置各社交平台的账号或二维码。填写链接后平台即生效，留空则不在网站展示。"
      {...settingGroupProps}
    >
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const row = rows[index] ?? field
          const meta = getSocialNetworkMeta(row.network)
          const Icon = SOCIAL_NETWORK_ICONS[row.network]
          return (
            <div key={field.id} className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl border bg-background text-foreground [&_svg]:size-4">
                  <Icon />
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {meta.type === 'qrcode' ? '点击图标会弹出二维码' : '点击图标会直接外跳链接'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Label htmlFor={`social-name-${row.network}`}>用户名（可选）</Label>
                <SettingsInput
                  flushOnBlur={flushOnBlur}
                  id={`social-name-${row.network}`}
                  value={row.name}
                  onChange={(e) => patch(index, { name: e.target.value })}
                  maxLength={60}
                  placeholder={meta.defaultName}
                />
              </div>
              <div className="flex flex-col gap-3">
                <Label htmlFor={`social-link-${row.network}`}>{meta.linkLabel}</Label>
                <SettingsInput
                  flushOnBlur={flushOnBlur}
                  id={`social-link-${row.network}`}
                  value={row.link}
                  onChange={(e) => patch(index, { link: e.target.value })}
                  placeholder={meta.linkPlaceholder}
                />
              </div>
              {meta.type === 'qrcode' ? (
                <div className="flex flex-col gap-3">
                  <Label htmlFor={`social-title-${row.network}`}>二维码弹窗标题（可选）</Label>
                  <SettingsInput
                    flushOnBlur={flushOnBlur}
                    id={`social-title-${row.network}`}
                    value={row.title}
                    onChange={(e) => patch(index, { title: e.target.value })}
                    maxLength={120}
                    placeholder={`扫码加我${meta.label}好友`}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </SettingGroup>
  )
}
