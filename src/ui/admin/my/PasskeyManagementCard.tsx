import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'

import { startRegistration } from '@simplewebauthn/browser'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FingerprintIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { isRecord } from '@/shared/utils/type-guards'
import { useWebAuthnSupported } from '@/ui/admin/auth/AdminCredentialsForm'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { useI18n } from '@/ui/lib/I18nProvider'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

function isPublicKeyCredentialCreationOptionsJSON(value: unknown): value is PublicKeyCredentialCreationOptionsJSON {
  return isRecord(value) && typeof value.challenge === 'string'
}

// Module scope because React Compiler can't lower `throw` inside a
// component's try/catch; the caller's catch maps failures to user-facing copy.
function resolveRegistrationOptions(response: unknown): PublicKeyCredentialCreationOptionsJSON {
  if (!isRecord(response) || !('options' in response)) {
    throw new Error('Invalid registration response')
  }
  if (!isPublicKeyCredentialCreationOptionsJSON(response.options)) {
    throw new Error('Invalid registration options')
  }
  return response.options
}

function usePasskeyManagement(_userId: string, revalidator: ReturnType<typeof useRevalidator>) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerMessage, setRegisterMessage] = useState<string | null>(null)

  const passkeyQuery = useQuery(orpcQuery.account.passkeyList.queryOptions())
  const credentials = passkeyQuery.data?.credentials ?? []

  const registerBeginMutation = useMutation({
    ...orpcQuery.account.passkeyRegisterBegin.mutationOptions(),
  })
  const registerFinishMutation = useMutation({
    ...orpcQuery.account.passkeyRegisterFinish.mutationOptions(),
    onSuccess: () => {
      setRegisterMessage(t('admin.my.passkey.registered'))
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
    },
  })
  const deleteMutation = useMutation({
    ...orpcQuery.account.passkeyDelete.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
      void revalidator.revalidate()
    },
    onError: (error) => {
      toastApiError(error, 'admin.toast.passkeyDeleteFailed', t)
    },
  })

  const handleRegister = async (deviceName?: string) => {
    setRegisterError(null)
    setRegisterMessage(null)
    try {
      const response = await registerBeginMutation.mutateAsync({ deviceName })
      const opts = resolveRegistrationOptions(response)
      const registrationResponse = await startRegistration({ optionsJSON: opts })
      await registerFinishMutation.mutateAsync({
        response: registrationResponse,
        deviceName,
        challenge: opts.challenge,
      })
    } catch (err) {
      let message = t('admin.my.passkey.registerFailed')
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          message = t('admin.my.passkey.cancelled')
        } else if (err.name === 'InvalidStateError') {
          message = t('admin.my.passkey.alreadyRegistered')
        } else if (err.name === 'SecurityError') {
          message = t('admin.my.passkey.securityRejected')
        }
      } else if (err instanceof Error && err.message) {
        message = err.message
      }
      setRegisterError(message)
    }
  }

  const handleDelete = (credentialId: string) => {
    deleteMutation.mutate({ credentialId })
  }

  return {
    credentials,
    isLoading: passkeyQuery.isPending,
    isError: passkeyQuery.isError,
    refetch: passkeyQuery.refetch,
    registerError,
    registerMessage,
    handleRegister,
    handleDelete,
    deletePending: deleteMutation.isPending,
    registerPending: registerBeginMutation.isPending || registerFinishMutation.isPending,
  }
}

interface PasskeyManagementCardProps {
  userId: string
  passkeyEnabled: boolean
}

export function PasskeyManagementCard({ userId, passkeyEnabled }: PasskeyManagementCardProps) {
  const { t } = useI18n()
  const config = useSiteIdentity()
  const revalidator = useRevalidator()
  const webAuthnSupported = useWebAuthnSupported()
  const [deviceNameInput, setDeviceNameInput] = useState('')
  const passkey = usePasskeyManagement(userId, revalidator)

  if (!passkeyEnabled || !webAuthnSupported) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.my.passkey.title')}</CardTitle>
        <CardDescription>{t('admin.my.passkey.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {passkey.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.state.loading')}</p>
        ) : passkey.isError ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-destructive">{t('admin.my.passkey.loadFailed')}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void passkey.refetch()}>
              {t('common.action.retry')}
            </Button>
          </div>
        ) : passkey.credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.my.passkey.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {passkey.credentials.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2">
                  <FingerprintIcon size={16} className="text-muted-foreground" />
                  <span className="text-sm">{c.deviceName || t('admin.my.passkey.unnamedDevice')}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.createdAt ? formatLocalDate(new Date(c.createdAt), DATE_FORMAT, config) : ''}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={passkey.deletePending}
                  onClick={() => passkey.handleDelete(c.id)}
                  aria-label={t('common.action.delete')}
                >
                  <Trash2Icon size={14} className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="passkey-device-name">{t('admin.my.passkey.deviceName')}</Label>
            <Input
              id="passkey-device-name"
              value={deviceNameInput}
              onChange={(e) => setDeviceNameInput(e.target.value)}
              placeholder={t('admin.my.passkey.devicePlaceholder', { number: passkey.credentials.length + 1 })}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={passkey.registerPending}
            onClick={() => {
              void passkey.handleRegister(
                deviceNameInput.trim() ||
                  t('admin.my.passkey.defaultDeviceName', { number: passkey.credentials.length + 1 }),
              )
            }}
          >
            <FingerprintIcon data-icon />
            {passkey.registerPending ? t('admin.my.passkey.registering') : t('admin.my.passkey.addDevice')}
          </Button>
        </div>
        {!!passkey.registerError && <p className="text-sm text-destructive">{passkey.registerError}</p>}
        {!!passkey.registerMessage && <p className="text-sm text-status-success-fg">{passkey.registerMessage}</p>}
      </CardContent>
    </Card>
  )
}
