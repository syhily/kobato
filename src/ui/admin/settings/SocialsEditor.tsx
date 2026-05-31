import { useFieldArray } from 'react-hook-form'

import type { SocialsSettings } from '@/shared/config/types'

import { type SocialNetwork, SOCIAL_NETWORKS, getSocialNetworkMeta } from '@/shared/config/socials'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingValue } from '@/ui/admin/settings/shell/SettingValue'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { SOCIAL_NETWORK_ICONS } from '@/ui/icons/social-icons'

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
  const { mode, form, settingGroupProps, display } = useSettingsCard<SocialsSettings, { rows: SocialRow[] }>({
    section: 'socials',
    source: socials,
    toState: toFormState,
    fromState: (state) => ({
      socials: state.rows
        .filter((row) => row.link.trim() !== '')
        .map((row) => {
          const meta = getSocialNetworkMeta(row.network)
          const customName = row.name.trim()
          return {
            name: customName || meta.defaultName,
            network: row.network,
            type: meta.type,
            ...(meta.type === 'qrcode' && row.title.trim() ? { title: row.title.trim() } : {}),
            link: row.link.trim(),
          }
        }),
    }),
  })

  const { fields, update: updateField } = useFieldArray({ control: form.control, name: 'rows' })

  const patch = (index: number, update: Partial<SocialRow>) => {
    const f = fields[index]
    updateField(index, {
      network: f.network,
      name: f.name,
      title: f.title,
      link: f.link,
      ...update,
    })
  }

  return (
    <SettingGroup
      title="社交链接"
      description="配置各社交平台的账号或二维码。填写链接后平台即生效，留空则不在网站展示。"
      {...settingGroupProps}
    >
      {mode === 'edit' ? (
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => {
            const meta = getSocialNetworkMeta(field.network)
            const Icon = SOCIAL_NETWORK_ICONS[field.network]
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
                  <Label htmlFor={`social-name-${field.network}`}>用户名（可选）</Label>
                  <Input
                    id={`social-name-${field.network}`}
                    value={field.name}
                    onChange={(e) => patch(index, { name: e.target.value })}
                    maxLength={60}
                    placeholder={meta.defaultName}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <Label htmlFor={`social-link-${field.network}`}>{meta.linkLabel}</Label>
                  <Input
                    id={`social-link-${field.network}`}
                    value={field.link}
                    onChange={(e) => patch(index, { link: e.target.value })}
                    placeholder={meta.linkPlaceholder}
                  />
                </div>
                {meta.type === 'qrcode' ? (
                  <div className="flex flex-col gap-3">
                    <Label htmlFor={`social-title-${field.network}`}>二维码弹窗标题（可选）</Label>
                    <Input
                      id={`social-title-${field.network}`}
                      value={field.title}
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
      ) : (
        <div className="flex flex-col gap-2">
          {display.socials.length === 0 ? (
            <p className="text-sm text-muted-foreground">未配置任何社交链接</p>
          ) : (
            display.socials.map((item) => {
              const meta = getSocialNetworkMeta(item.network)
              return (
                <SettingValue
                  key={item.network}
                  label={meta.label}
                  value={item.link}
                  hint={item.name !== meta.defaultName ? item.name : undefined}
                />
              )
            })
          )}
        </div>
      )}
    </SettingGroup>
  )
}
