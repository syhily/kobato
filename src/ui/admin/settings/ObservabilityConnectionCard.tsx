import { useMutation } from '@tanstack/react-query'
import { PlugZapIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import type { ObservabilitySettings } from '@/shared/config/types'
import type { ObservabilityStatusOutput, ObservabilityTestConnectionOutput } from '@/shared/contracts/observability'

import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { ObservabilityProvisionSummaryLines } from '@/ui/admin/settings/ObservabilityProvisionSummaryLines'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@/ui/admin/settings/shell/SettingsSecretInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

interface ConnectionFormState {
  endpoint: string
  organization: string
  username: string
  password: string
}

interface ObservabilityConnectionCardProps {
  observability: ObservabilitySettings
  /** Last-4 mask from the loader — the stored password never reaches the form. */
  passwordMask: string | null
  status: ObservabilityStatusOutput | undefined
  onStatusInvalidated: () => void
}

export function ObservabilityConnectionCard({
  observability,
  passwordMask,
  status,
  onStatusInvalidated,
}: ObservabilityConnectionCardProps) {
  const { t, localizeMessage } = useI18n()
  const [outcome, setOutcome] = useState<ObservabilityTestConnectionOutput | null>(null)
  const [flushBlocked, setFlushBlocked] = useState(false)

  const { form, flush, flushOnBlur, settingGroupProps } = useSettingsCard<ObservabilitySettings, ConnectionFormState>({
    section: 'observability',
    source: observability,
    // The stored secret never seeds the form — only the loader mask drives the display.
    toState: (source) => ({
      endpoint: source.observability.endpoint,
      organization: source.observability.organization,
      username: source.observability.username,
      password: '',
    }),
    // Empty input omits the secret — the server keeps the stored password.
    fromState: (state) => ({
      observability: {
        endpoint: state.endpoint.trim(),
        organization: state.organization.trim(),
        username: state.username.trim(),
        ...secretFieldPatch(state.password, 'password'),
      },
    }),
    // Any saved connection change can invalidate the verified fingerprint.
    onSaved: onStatusInvalidated,
  })

  const testMutation = useMutation({
    ...orpcQuery.admin.observability.testConnection.mutationOptions(),
    onSuccess: (result) => {
      setOutcome(result)
      onStatusInvalidated()
    },
    onError: onMutationError('admin.settings.observability.connection.testFailed', t),
  })
  const [isFlushing, setIsFlushing] = useState(false)
  const isTesting = testMutation.isPending
  const isBusy = isFlushing || isTesting

  // The test reads SAVED settings only: flush this card first and skip the call
  // when a dirty field cannot be committed (the failed save already surfaced).
  const runTest = useCallback(() => {
    if (isBusy) {
      return
    }
    void (async () => {
      setFlushBlocked(false)
      setIsFlushing(true)
      try {
        const clean = await flush()
        if (!clean) {
          setFlushBlocked(true)
          return
        }
        setOutcome(null)
        testMutation.mutate({})
      } finally {
        setIsFlushing(false)
      }
    })()
  }, [flush, testMutation, isBusy])

  const passwordField = secretFieldStrings({
    t,
    mask: passwordMask,
    keepLabel: t('admin.settings.observability.connection.keepPassword'),
    emptyHint: t('admin.settings.observability.connection.passwordHintEmpty'),
    emptyPlaceholder: t('admin.settings.observability.connection.passwordPlaceholder'),
  })

  return (
    <SettingGroup
      title={t('admin.settings.observability.connection.title')}
      description={t('admin.settings.observability.connection.description')}
      {...settingGroupProps}
    >
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.observability.connection.endpoint')}
          htmlFor="observability-endpoint"
          hint={t('admin.settings.observability.connection.endpointHint')}
          labelTooltip={t('admin.settings.observability.tooltip.endpoint')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="observability-endpoint"
            placeholder={t('admin.settings.observability.connection.endpointPlaceholder')}
            maxLength={500}
            {...form.register('endpoint')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.observability.connection.organization')}
          htmlFor="observability-organization"
          hint={t('admin.settings.observability.connection.organizationHint')}
          labelTooltip={t('admin.settings.observability.tooltip.organization')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="observability-organization"
            maxLength={64}
            {...form.register('organization')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.observability.connection.username')}
          htmlFor="observability-username"
          labelTooltip={t('admin.settings.observability.tooltip.username')}
        >
          <SettingsInput
            flushOnBlur={flushOnBlur}
            id="observability-username"
            autoComplete="username"
            maxLength={320}
            {...form.register('username')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('admin.settings.observability.connection.password')}
          htmlFor="observability-password"
          hint={passwordField.hint}
          labelTooltip={t('admin.settings.observability.tooltip.password')}
        >
          <SettingsSecretInput
            flushOnBlur={flushOnBlur}
            id="observability-password"
            placeholder={passwordField.placeholder}
            {...form.register('password')}
          />
        </SettingsRow>

        <SettingsRow
          label={t('admin.settings.observability.connection.test')}
          hint={t('admin.settings.observability.connection.testHint')}
        >
          <div className="flex flex-col gap-2">
            <div>
              <Button type="button" variant="secondary" disabled={isBusy} onClick={runTest}>
                <PlugZapIcon data-icon />{' '}
                {isBusy
                  ? t('admin.settings.observability.connection.testing')
                  : t('admin.settings.observability.connection.test')}
              </Button>
            </div>
            {flushBlocked ? (
              <p className="text-sm text-destructive">{t('admin.settings.observability.connection.unsaved')}</p>
            ) : null}
            {outcome !== null ? (
              <div className="flex flex-col gap-1 text-sm" role="status">
                <p className="text-status-success-fg">{t('admin.settings.observability.connection.testSucceeded')}</p>
                {outcome.version !== null ? (
                  <p className="text-muted-foreground">
                    {t('admin.settings.observability.connection.version', { version: outcome.version })}
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  {t(
                    outcome.organization === 'created'
                      ? 'admin.settings.observability.assets.organizationCreated'
                      : 'admin.settings.observability.assets.organizationExists',
                  )}
                </p>
                {outcome.provision.status === 'succeeded' ? (
                  <ObservabilityProvisionSummaryLines summary={outcome.provision} />
                ) : (
                  <>
                    <p className="text-status-warn-fg">
                      {localizeMessage(outcome.provision.descriptor.messageKey, outcome.provision.descriptor.params)}
                    </p>
                    <p className="text-status-warn-fg">
                      {t('admin.settings.observability.connection.provisionRetryHint')}
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </SettingsRow>

        {status !== undefined ? (
          <div className="flex flex-col gap-1 text-sm" role="status">
            <p className={cn(status.verified ? 'text-status-success-fg' : 'text-muted-foreground')}>
              {t(
                status.verified
                  ? 'admin.settings.observability.connection.verified'
                  : 'admin.settings.observability.connection.unverified',
              )}
            </p>
            {status.version !== null ? (
              <p className="text-muted-foreground">
                {t('admin.settings.observability.connection.version', { version: status.version })}
              </p>
            ) : null}
          </div>
        ) : null}
      </SettingGroupContent>
    </SettingGroup>
  )
}
