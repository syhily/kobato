import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser'

import { startRegistration } from '@simplewebauthn/browser'
import { FingerprintIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import { orpcQuery, useMutation, useQuery, useQueryClient } from '@/client/api/query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { useWebAuthnSupported } from '@/ui/admin/auth/AdminCredentialsForm'
import { Button } from '@/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Separator } from '@/ui/components/separator'
import { Switch } from '@/ui/components/switch'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

function usePasskeyManagement(_userId: string, revalidator: ReturnType<typeof useRevalidator>) {
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
      setRegisterMessage('Passkey 注册成功。')
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
    },
  })
  const deleteMutation = useMutation({
    ...orpcQuery.account.passkeyDelete.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
      void revalidator.revalidate()
    },
  })
  const setForceMutation = useMutation({
    ...orpcQuery.account.passkeySetForce.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpcQuery.account.passkeyList.key() })
      void revalidator.revalidate()
    },
  })

  const handleRegister = async (deviceName?: string) => {
    setRegisterError(null)
    setRegisterMessage(null)
    try {
      const { options } = await registerBeginMutation.mutateAsync({ deviceName })
      const opts = options as PublicKeyCredentialCreationOptionsJSON
      const response = await startRegistration({ optionsJSON: opts })
      await registerFinishMutation.mutateAsync({
        response: response as RegistrationResponseJSON,
        deviceName,
        challenge: opts.challenge,
      })
    } catch (err) {
      let message = 'Passkey 注册失败，请重试。'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          message = 'Passkey 注册被取消或超时。'
        } else if (err.name === 'InvalidStateError') {
          message = '该设备已注册 Passkey。'
        } else if (err.name === 'SecurityError') {
          message = 'Passkey 注册因安全原因被拒绝。'
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
    registerError,
    registerMessage,
    handleRegister,
    handleDelete,
    setForceMutation,
    deletePending: deleteMutation.isPending,
    registerPending: registerBeginMutation.isPending || registerFinishMutation.isPending,
  }
}

interface PasskeyManagementCardProps {
  userId: string
  passkeyForce: boolean
  passkeyEnabled: boolean
}

export function PasskeyManagementCard({ userId, passkeyForce, passkeyEnabled }: PasskeyManagementCardProps) {
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
        <CardTitle>Passkey 管理</CardTitle>
        <CardDescription>管理你的 Passkey 凭据与登录偏好。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {passkey.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : passkey.credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未注册任何 Passkey。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {passkey.credentials.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2">
                  <FingerprintIcon size={16} className="text-muted-foreground" />
                  <span className="text-sm">{c.deviceName || '未命名设备'}</span>
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
                  aria-label="删除"
                >
                  <Trash2Icon size={14} className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="passkey-device-name">设备名称（可选）</Label>
            <Input
              id="passkey-device-name"
              value={deviceNameInput}
              onChange={(e) => setDeviceNameInput(e.target.value)}
              placeholder={`设备 ${passkey.credentials.length + 1}`}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={passkey.registerPending}
            onClick={() => {
              void passkey.handleRegister(deviceNameInput.trim() || `设备 ${passkey.credentials.length + 1}`)
            }}
          >
            <FingerprintIcon data-icon />
            {passkey.registerPending ? '注册中…' : '添加新设备'}
          </Button>
        </div>
        {!!passkey.registerError && <p className="text-sm text-destructive">{passkey.registerError}</p>}
        {!!passkey.registerMessage && <p className="text-sm text-status-success-fg">{passkey.registerMessage}</p>}

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">强制使用 Passkey 登录</span>
            <span className="text-xs text-muted-foreground">
              开启后密码登录将被禁用，忘记密码会同时清除所有 Passkey。
            </span>
          </div>
          <Switch
            checked={passkeyForce}
            disabled={passkey.credentials.length === 0 || passkey.setForceMutation.isPending}
            onCheckedChange={(val) => passkey.setForceMutation.mutate({ force: val })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
