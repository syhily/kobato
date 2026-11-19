import type { SecuritySettings } from '@kobato/settings/types.ts'

import { Button } from '@kobato/ui/components/button.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { type ExemptPathRow, MAX_EXEMPT_PATHS } from '@kobato/web-admin/ui/settings/security/model.ts'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection.tsx'
import { SettingGroup } from '@kobato/web-admin/ui/settings/shell/SettingGroup.tsx'
import { SettingGroupContent } from '@kobato/web-admin/ui/settings/shell/SettingGroupContent.tsx'
import { SettingsInput } from '@kobato/web-admin/ui/settings/shell/SettingsInput.tsx'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useFieldArray } from 'react-hook-form'

export function CsrfExemptPathsCard({ security }: { security: SecuritySettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, flushOnBlur } = useSettingsCard<SecuritySettings, { exemptPaths: ExemptPathRow[] }>({
    section: 'security',
    source: security,
    toState: (source) => ({
      exemptPaths: source.csrf.exemptPaths.map((path, i) => ({ clientId: `csrf-exempt-${i}`, path })),
    }),
    fromState: (state) => ({
      csrf: {
        exemptPaths: state.exemptPaths.map((row) => row.path.trim()).filter((p) => p !== ''),
      },
    }),
  })

  const rows = useFieldArray({ control: form.control, name: 'exemptPaths' })

  return (
    <SettingGroup
      title={t('admin.settings.security.exempt.title')}
      description={t('admin.settings.security.exempt.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.security.exempt.paths')}
          hint={t('admin.settings.security.exempt.pathsHint', { max: MAX_EXEMPT_PATHS })}
        >
          <div className="flex flex-col gap-3">
            {rows.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('admin.settings.security.exempt.empty')}</p>
            ) : (
              rows.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <SettingsInput
                    flushOnBlur={flushOnBlur}
                    type="text"
                    placeholder="/webhook/github"
                    className="flex-1"
                    {...form.register(`exemptPaths.${index}.path` as const)}
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
                disabled={rows.fields.length >= MAX_EXEMPT_PATHS}
                onClick={() => rows.append({ clientId: crypto.randomUUID(), path: '' })}
              >
                <PlusIcon /> {t('admin.settings.security.exempt.add')}
              </Button>
              {rows.fields.length >= MAX_EXEMPT_PATHS && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('admin.settings.security.exempt.limit', { max: MAX_EXEMPT_PATHS })}
                </span>
              )}
            </div>
          </div>
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}
