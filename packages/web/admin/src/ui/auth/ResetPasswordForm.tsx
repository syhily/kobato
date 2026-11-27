import { MIN_PASSWORD_LENGTH } from '@kobato/base/auth/security'
import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { inputClasses } from '@kobato/web-admin/ui/auth/input-classes'
import { PasswordToggle } from '@kobato/web-admin/ui/auth/PasswordToggle'
import { ArrowRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Form } from 'react-router'

export interface ResetPasswordFormProps {
  action?: string
  token: string
  isSubmitting: boolean
  csrfToken?: string
}

export function ResetPasswordForm({ action, token, isSubmitting, csrfToken }: ResetPasswordFormProps) {
  const { t } = useI18n()
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Form method="post" action={action} id="loginForm" className="flex w-full flex-col gap-6">
      <input type="hidden" name="reset_token" value={token} />
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="loginForm-password" className="text-admin-base font-semibold">
          {t('auth.reset.newPassword')}
        </Label>
        <div className="relative w-full">
          <Input
            id="loginForm-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="•••••••••••••••"
            required
            minLength={MIN_PASSWORD_LENGTH}
            disabled={isSubmitting}
            className={cn(inputClasses, 'pr-12')}
          />
          <div className="absolute top-3 right-2 bottom-3 flex items-center">
            <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </div>
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-auth-btn w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          t('auth.reset.saving')
        ) : (
          <>
            {t('auth.reset.submit')} <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}
