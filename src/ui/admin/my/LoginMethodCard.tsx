import { useMutation, useQuery } from '@tanstack/react-query'
import { useRevalidator } from 'react-router'

import type { LoginMethod } from '@/shared/contracts/users'

import { orpcQuery } from '@/client/api/orpc-query'
import { loginMethodSchema } from '@/shared/contracts/users'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Label } from '@/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@/ui/components/radio-group'

interface LoginMethodOption {
  value: LoginMethod
  label: string
  description: string
  disabled: boolean
  disabledHint: string | null
}

interface LoginMethodCardProps {
  loginMethod: LoginMethod
  passkeyEnabled: boolean
  mailReady: boolean
}

export function LoginMethodCard({ loginMethod, passkeyEnabled, mailReady }: LoginMethodCardProps) {
  const revalidator = useRevalidator()
  // Same query cache as PasskeyManagementCard — registering/deleting there immediately updates this disabled state.
  const passkeyQuery = useQuery(orpcQuery.account.passkeyList.queryOptions())
  const passkeyCount = passkeyQuery.data?.credentials.length ?? 0

  const mutation = useMutation({
    ...orpcQuery.account.setLoginMethod.mutationOptions(),
    onSuccess: () => {
      void revalidator.revalidate()
    },
  })

  const options: LoginMethodOption[] = [
    {
      value: 'password',
      label: '密码登陆',
      description: '使用邮箱和密码登陆；配置邮件服务后，密码验证通过还需输入邮箱收到的验证码。',
      disabled: false,
      disabledHint: null,
    },
    {
      value: 'magic-link',
      label: '邮箱链接登陆',
      description: '每次登陆时向你的邮箱发送一次性登陆链接，点击链接即可登陆，无需密码。',
      disabled: !mailReady,
      disabledHint: mailReady ? null : '需要管理员先在「设置 → 邮件服务」完成邮件配置。',
    },
    {
      value: 'passkey',
      label: 'Passkey 登陆',
      description: '使用已注册的 Passkey（指纹、面容识别、硬件密钥等）免密登陆。',
      disabled: !passkeyEnabled || passkeyCount === 0,
      disabledHint: !passkeyEnabled
        ? 'Passkey 功能未启用，请联系管理员在「设置 → 安全」中开启。'
        : passkeyCount === 0
          ? '需要先在下方「Passkey 管理」中注册至少一个 Passkey。'
          : null,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>登陆方式</CardTitle>
        <CardDescription>选择你在登陆页输入邮箱后使用的验证方式。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RadioGroup
          value={loginMethod}
          onValueChange={(value) => {
            const parsed = loginMethodSchema.safeParse(value)
            if (parsed.success) {
              mutation.mutate({ method: parsed.data })
            }
          }}
          disabled={mutation.isPending}
        >
          {options.map((option) => (
            <div key={option.value} className="flex items-start gap-3">
              <RadioGroupItem
                id={`login-method-${option.value}`}
                value={option.value}
                disabled={option.disabled}
                className="mt-1"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor={`login-method-${option.value}`} className="font-medium">
                  {option.label}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {option.disabled && option.disabledHint ? option.disabledHint : option.description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
        {!!mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
      </CardContent>
    </Card>
  )
}
