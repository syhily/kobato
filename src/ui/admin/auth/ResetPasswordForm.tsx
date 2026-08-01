import { ArrowRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Form } from 'react-router'

import { inputClasses, PasswordToggle } from '@/ui/admin/auth/shared'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Covers both resetpassword and accept-invite.
export interface ResetPasswordFormProps {
  action?: string
  token: string
  isSubmitting: boolean
  csrfToken?: string
}

export function ResetPasswordForm({ action, token, isSubmitting, csrfToken }: ResetPasswordFormProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Form method="post" action={action} id="loginForm" className="flex w-full flex-col gap-6">
      <input type="hidden" name="reset_token" value={token} />
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="loginForm-password" className="font-semibold text-(--text-admin-base)">
          新密码
        </Label>
        <div className="relative w-full">
          <Input
            id="loginForm-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="•••••••••••••••"
            required
            minLength={6}
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
        className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          '保存中…'
        ) : (
          <>
            设置密码 <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}
