import type { LoginActionData } from '@kobato/ui/admin/auth/AdminCredentialsForm'

import { inputClasses } from '@kobato/ui/admin/auth/shared'
import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { cn } from '@kobato/ui/lib/cn'
import { ArrowRightIcon, RotateCcwIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Form } from 'react-router'

export interface OtpFormProps {
  email: string
  sentAt: number
  isSubmitting: boolean
  csrfToken?: string
  actionData?: LoginActionData | null
}

const RESEND_COOLDOWN_SECONDS = 60

function calcInitialCooldown(sentAt: number): number {
  const elapsed = (Date.now() - sentAt) / 1000
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed))
}

export function OtpForm({ email, sentAt, isSubmitting, csrfToken, actionData }: OtpFormProps) {
  const [cooldown, setCooldown] = useState(() => calcInitialCooldown(sentAt))

  const shouldTick = cooldown > 0
  useEffect(() => {
    if (!shouldTick) {
      return
    }
    const id = setInterval(() => {
      setCooldown((p) => (p <= 1 ? 0 : p - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [shouldTick])

  const [lastActionData, setLastActionData] = useState(actionData)
  if (actionData !== lastActionData) {
    setLastActionData(actionData)
    if (actionData?.message === '验证码已重新发送。') {
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <p className="text-center text-sm text-muted-foreground">
        验证码已发送至 <span className="font-medium text-foreground">{email}</span>，请输入 6 位验证码
      </p>

      <Form method="post" action="?action=verifyotp" id="otpForm" className="flex w-full flex-col gap-6">
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="otpForm-otp" className="font-semibold text-(--text-admin-base)">
            验证码
          </Label>
          <Input
            id="otpForm-otp"
            name="otp_code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            required
            minLength={6}
            maxLength={6}
            pattern="[0-9]{6}"
            disabled={isSubmitting}
            className={cn(inputClasses, 'text-center tracking-[0.5em]')}
          />
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
        >
          {isSubmitting ? (
            '验证中...'
          ) : (
            <>
              验证并登录 <ArrowRightIcon className="ml-1 inline-block" size={18} />
            </>
          )}
        </Button>
      </Form>

      <div className="flex items-center justify-between">
        <Form method="post" action="?action=resendotp" className="inline">
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <button
            type="submit"
            disabled={cooldown > 0 || isSubmitting}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcwIcon size={14} />
            {cooldown > 0 ? `${cooldown} 秒后重新发送` : '重新发送'}
          </button>
        </Form>
        <Form method="post" action="?action=cancelotp" className="inline">
          {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
          <button type="submit" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            返回登录
          </button>
        </Form>
      </div>
    </div>
  )
}
