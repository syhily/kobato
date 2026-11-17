import type { BackupLoaderShape } from '@kobato/shared/config/projection.ts'

import { Controller, useWatch } from 'react-hook-form'

import { FieldLabel } from '../../components/field'
import { useI18n } from '../../lib/I18nProvider'
import { SettingsRow } from './SettingsSection'
import { SettingGroup } from './shell/SettingGroup'
import { SettingGroupContent } from './shell/SettingGroupContent'
import { SettingsSecretInput, secretFieldStrings } from './shell/SettingsSecretInput'
import { SettingsSwitch } from './shell/SettingsSwitch'
import { useSettingsCard } from './shell/useSettingsCard'

interface FormState {
  encryptionEnabled: boolean
  password: string
}

interface BackupEncryptionCardProps {
  backup: BackupLoaderShape
}

export function BackupEncryptionCard({ backup }: BackupEncryptionCardProps) {
  const { t } = useI18n()
  const { form, flushOnBlur, save, display, settingGroupProps } = useSettingsCard<BackupLoaderShape, FormState>({
    section: 'backup',
    source: backup,
    // The stored secret never seeds the form — only the mask drives the display.
    toState: (source) => ({ encryptionEnabled: source.encryption.enabled, password: '' }),
    fromState: (state) => ({
      encryption: {
        enabled: state.encryptionEnabled,
        // Empty input omits the key — the server keeps the stored password.
        ...(state.password.trim() !== '' ? { password: state.password.trim() } : {}),
      },
    }),
  })

  const enabled = useWatch({ control: form.control, name: 'encryptionEnabled' })
  const strings = secretFieldStrings({
    t,
    mask: display.passwordMask,
    keepLabel: t('admin.settings.backup.encryption.keepPassword'),
    emptyHint: t('admin.settings.backup.encryption.passwordHintEmpty'),
    emptyPlaceholder: t('admin.settings.backup.encryption.passwordPlaceholder'),
  })

  return (
    <SettingGroup
      title={t('admin.settings.backup.encryption.title')}
      description={t('admin.settings.backup.encryption.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label={t('admin.settings.backup.encryption.enable')}>
          <Controller
            control={form.control}
            name="encryptionEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <SettingsSwitch
                  name={field.name}
                  id="backup-encryption-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  save={save}
                />
                <FieldLabel htmlFor="backup-encryption-enabled" className="font-normal">
                  {t('admin.settings.backup.encryption.enableLabel')}
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>

        {enabled && (
          <>
            <SettingsRow label={t('admin.settings.backup.encryption.password')} hint={strings.hint}>
              <SettingsSecretInput
                flushOnBlur={flushOnBlur}
                placeholder={strings.placeholder}
                {...form.register('password')}
              />
            </SettingsRow>
            {display.passwordMask === null && (
              <p className="text-sm text-status-warn-fg">{t('admin.settings.backup.encryption.missingPassword')}</p>
            )}
          </>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}
