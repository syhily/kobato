import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { Form } from 'react-router'

// Shared auth input styling — must match other auth forms.
const inputClasses =
  'h-(--spacing-auth-input) rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

export interface SetupTokenVerifyFormProps {
  isSubmitting: boolean
  csrfToken?: string
  actionData?: { error?: string; setupTokenVerified?: boolean } | null
}

export function SetupTokenVerifyForm({ isSubmitting, csrfToken, actionData }: SetupTokenVerifyFormProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <p className="text-center text-sm text-muted-foreground">请输入服务器控制台中显示的 Setup Token。</p>

      {actionData?.error ? (
        <div role="alert" aria-live="polite" className="text-center text-sm leading-relaxed text-destructive">
          {actionData.error}
        </div>
      ) : null}

      <Form method="post" id="setupTokenVerifyForm" className="flex w-full flex-col gap-6">
        <input type="hidden" name="intent" value="verify-token" />
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="setup-token" className="font-semibold text-(--text-admin-base)">
            Setup Token
          </Label>
          <Input
            id="setup-token"
            name="setup_token"
            type="text"
            autoComplete="off"
            placeholder="例如：a1b2c3d4..."
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
          {isSubmitting ? '验证中...' : '验证并继续'}
        </Button>
      </Form>
    </div>
  )
}
