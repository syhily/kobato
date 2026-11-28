import type { SecuritySettings } from '@kobato/settings/types'

import { Button } from '@kobato/ui/components/button'
import { FieldLabel } from '@kobato/ui/components/field'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Controller, useFieldArray } from 'react-hook-form'

import { type OriginRow, MAX_ORIGINS } from '@/ui/settings/security/model'
import { SettingsRow } from '@/ui/settings/SettingsSection'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/settings/shell/SettingsInput'
import { SettingsSwitch } from '@/ui/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/settings/shell/use-settings-card'

export function CorsPolicyCard({ security }: { security: SecuritySettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, save, flushOnBlur } = useSettingsCard<
    SecuritySettings,
    { enabled: boolean; origins: OriginRow[] }
  >({
    section: 'security',
    source: security,
    toState: (source) => ({
      enabled: source.cors.enabled,
      origins: source.cors.origins.map((url, i) => ({ clientId: `cors-origin-${i}`, url })),
    }),
    fromState: (state) => ({
      cors: {
        enabled: state.enabled,
        origins: state.origins.map((row) => row.url.trim()).filter((url) => url !== ''),
      },
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'origins' })

  return (
    <SettingGroup
      title={t('admin.settings.security.cors.title')}
      description={t('admin.settings.security.cors.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.security.cors.enable')}
          hint={t('admin.settings.security.cors.enableHint')}
        >
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="cors-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="cors-enabled" className="font-normal">
                  {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.security.cors.origins')}
          hint={t('admin.settings.security.cors.originsHint', { max: MAX_ORIGINS })}
        >
          <p className="rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-sm text-status-warn-fg">
            {t('admin.settings.security.cors.warning')}
          </p>
          <div className="flex flex-col gap-3">
            {rows.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('admin.settings.security.cors.mirror')}</p>
            ) : (
              rows.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <SettingsInput
                    flushOnBlur={flushOnBlur}
                    type="url"
                    placeholder="https://example.com"
                    maxLength={253}
                    className="flex-1"
                    {...form.register(`origins.${index}.url` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => rows.remove(index)}
                    aria-label={t('admin.settings.security.removeItem')}
                  >
                    <Trash2Icon className="text-destructive" />
                  </Button>
                </div>
              ))
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.fields.length >= MAX_ORIGINS}
                onClick={() => rows.append({ clientId: crypto.randomUUID(), url: '' })}
              >
                <PlusIcon /> {t('admin.settings.security.cors.add')}
              </Button>
              {rows.fields.length >= MAX_ORIGINS && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('admin.settings.security.cors.limit', { max: MAX_ORIGINS })}
                </span>
              )}
            </div>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
