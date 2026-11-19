import { Button } from '@kobato/ui/components/button.tsx'
import { Input } from '@kobato/ui/components/input.tsx'
import { Label } from '@kobato/ui/components/label.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { inputClasses } from '@kobato/web-admin/ui/auth/input-classes.ts'
import { SendIcon } from 'lucide-react'
import { Form, Link } from 'react-router'

export interface LostPasswordFormProps {
  action?: string
  isSubmitting: boolean
  csrfToken?: string
}

export function LostPasswordForm({ action, isSubmitting, csrfToken }: LostPasswordFormProps) {
  const { t } = useI18n()
  return (
    <Form method="post" action={action} id="loginForm" className="flex w-full flex-col gap-6">
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="loginForm-email" className="text-admin-base font-semibold">
          {t('auth.lost.title')}
        </Label>
        <Input
          id="loginForm-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t('auth.shared.emailPlaceholder')}
          required
          disabled={isSubmitting}
          className={inputClasses}
        />
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-auth-btn w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          t('auth.lost.sending')
        ) : (
          <>
            {t('auth.lost.submit')} <SendIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
      <p className="text-center text-admin-sm text-muted-foreground">
        <Link to="/admin/signin" className="transition-colors hover:text-foreground">
          {t('auth.lost.back')}
        </Link>
      </p>
    </Form>
  )
}
