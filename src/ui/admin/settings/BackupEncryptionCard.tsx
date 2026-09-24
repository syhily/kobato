import { Controller, useWatch } from 'react-hook-form'

import type { BackupLoaderShape } from '@/shared/config/projection'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsSecretInput, secretFieldStrings } from '@/ui/admin/settings/shell/SettingsSecretInput'
import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { FieldLabel } from '@/ui/components/field'

interface FormState {
  encryptionEnabled: boolean
  password: string
}

interface BackupEncryptionCardProps {
  backup: BackupLoaderShape
}

export function BackupEncryptionCard({ backup }: BackupEncryptionCardProps) {
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
    mask: display.passwordMask,
    keepLabel: '保留现有密码',
    emptyHint: '设置后，所有新备份（含定时备份）都会用该密码加密；还原加密备份时需要输入它。',
    emptyPlaceholder: '至少 8 位',
  })

  return (
    <SettingGroup
      title="备份加密"
      description="用密码加密备份归档（分块 AES-256-GCM），加密备份的存储键以 .enc 结尾。"
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow label="加密新备份">
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
                  开启
                </FieldLabel>
              </div>
            )}
          />
        </SettingsRow>

        {enabled && (
          <>
            <SettingsRow label="加密密码" hint={strings.hint}>
              <SettingsSecretInput
                flushOnBlur={flushOnBlur}
                placeholder={strings.placeholder}
                {...form.register('password')}
              />
            </SettingsRow>
            {display.passwordMask === null && (
              <p className="text-sm text-status-warn-fg">已启用加密但尚未设置密码——在设置密码之前，备份不会加密。</p>
            )}
          </>
        )}
      </SettingGroupContent>
    </SettingGroup>
  )
}
