import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Controller, useFieldArray } from 'react-hook-form'

import type { SecuritySettings } from '@/shared/config/types'

import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { isValidPasskeyDomain } from '@/shared/utils/safe-url'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { FieldLabel } from '@/ui/components/field'
import { useI18n } from '@/ui/lib/I18nProvider'

interface ExemptPathRow {
  clientId: string
  path: string
}

interface OriginRow {
  clientId: string
  url: string
}

interface SecurityFormProps {
  security: SecuritySettings
}

const MAX_EXEMPT_PATHS = 20
const MAX_ORIGINS = 20

function CsrfToggleCard({ security }: { security: SecuritySettings }) {
  const { t } = useI18n()
  const { form, settingGroupProps, save } = useSettingsCard<SecuritySettings, { enabled: boolean }>({
    section: 'security',
    source: security,
    toState: (source) => ({ enabled: source.csrf.enabled }),
    fromState: (state) => ({
      csrf: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.security.csrf.title')}
      description={t('admin.settings.security.csrf.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.security.csrf.enable')}
          hint={t('admin.settings.security.csrf.enableHint')}
        >
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="csrf-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="csrf-enabled" className="font-normal">
                  {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
      </SettingGroupContent>
    </SettingGroup>
  )
}

function CsrfExemptPathsCard({ security }: { security: SecuritySettings }) {
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

function CorsPolicyCard({ security }: { security: SecuritySettings }) {
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

function PasskeyToggleCard({ security }: { security: SecuritySettings }) {
  const { t } = useI18n()
  const siteIdentity = useSiteIdentity()
  const website = siteIdentity?.website ?? ''
  const domainValid = isValidPasskeyDomain(website)

  const { form, settingGroupProps, save } = useSettingsCard<SecuritySettings, { enabled: boolean }>({
    section: 'security',
    source: security,
    toState: (source) => ({ enabled: source.passkey?.enabled ?? false }),
    fromState: (state) => ({
      passkey: { enabled: state.enabled },
    }),
  })

  return (
    <SettingGroup
      title={t('admin.settings.security.passkey.title')}
      description={t('admin.settings.security.passkey.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.security.passkey.enable')}
          hint={
            domainValid
              ? t('admin.settings.security.passkey.enableHint')
              : t('admin.settings.security.passkey.requireDomain')
          }
        >
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="passkey-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                  disabled={!domainValid && !field.value}
                />
                <FieldLabel htmlFor="passkey-enabled" className="font-normal">
                  {field.value ? t('admin.settings.shared.toggle.on') : t('admin.settings.shared.toggle.off')}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>
        {!domainValid && (
          <p className="text-sm text-muted-foreground">{t('admin.settings.security.passkey.domainWarning')}</p>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}

export function SecurityForm({ security }: SecurityFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CsrfToggleCard security={security} />
      <CsrfExemptPathsCard security={security} />
      <CorsPolicyCard security={security} />
      <PasskeyToggleCard security={security} />
    </div>
  )
}
