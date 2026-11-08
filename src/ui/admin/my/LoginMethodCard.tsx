import { useMutation, useQuery } from '@tanstack/react-query'
import { useRevalidator } from 'react-router'

import type { LoginMethod } from '@/shared/contracts/users'

import { orpcQuery } from '@/client/api/orpc-query'
import { loginMethodSchema } from '@/shared/contracts/users'
import { LabelledRadio } from '@/ui/admin/shared/LabelledRadio'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { RadioGroup } from '@/ui/components/radio-group'
import { useI18n } from '@/ui/lib/I18nProvider'

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
  const { t } = useI18n()
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
      label: t('admin.my.login.password.label'),
      description: t('admin.my.login.password.description'),
      disabled: false,
      disabledHint: null,
    },
    {
      value: 'magic-link',
      label: t('admin.my.login.magic.label'),
      description: t('admin.my.login.magic.description'),
      disabled: !mailReady,
      disabledHint: mailReady ? null : t('admin.my.login.magic.disabled'),
    },
    {
      value: 'passkey',
      label: t('admin.my.login.passkey.label'),
      description: t('admin.my.login.passkey.description'),
      disabled: !passkeyEnabled || passkeyCount === 0,
      disabledHint: !passkeyEnabled
        ? t('admin.my.login.passkey.disabledFeature')
        : passkeyCount === 0
          ? t('admin.my.login.passkey.disabledNone')
          : null,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.my.login.title')}</CardTitle>
        <CardDescription>{t('admin.my.login.description')}</CardDescription>
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
            <LabelledRadio
              key={option.value}
              id={`login-method-${option.value}`}
              value={option.value}
              disabled={option.disabled}
              label={option.label}
              description={option.disabled && option.disabledHint ? option.disabledHint : option.description}
            />
          ))}
        </RadioGroup>
        {!!mutation.error && <p className="text-sm text-destructive">{mutation.error.message}</p>}
      </CardContent>
    </Card>
  )
}
