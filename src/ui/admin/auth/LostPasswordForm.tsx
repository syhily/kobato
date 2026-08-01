import { SendIcon } from 'lucide-react'
import { Form, Link } from 'react-router'

import { inputClasses } from '@/ui/admin/auth/shared'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'

export interface LostPasswordFormProps {
  action?: string
  isSubmitting: boolean
  csrfToken?: string
}

export function LostPasswordForm({ action, isSubmitting, csrfToken }: LostPasswordFormProps) {
  return (
    <Form method="post" action={action} id="loginForm" className="flex w-full flex-col gap-6">
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="loginForm-email" className="font-semibold text-(--text-admin-base)">
          邮箱
        </Label>
        <Input
          id="loginForm-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="your@email.com"
          required
          disabled={isSubmitting}
          className={inputClasses}
        />
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          '发送中...'
        ) : (
          <>
            发送重置邮件 <SendIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
      <p className="text-center text-(--text-admin-sm) text-muted-foreground">
        <Link to="/admin/signin" className="transition-colors hover:text-foreground">
          返回登陆
        </Link>
      </p>
    </Form>
  )
}
