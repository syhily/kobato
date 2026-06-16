/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion */
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

import { startAuthentication } from '@simplewebauthn/browser'
import { ArrowRightIcon, EyeIcon, EyeOffIcon, FingerprintIcon, RotateCcwIcon, SendIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Form, Link } from 'react-router'

import { orpc } from '@/client/api/client'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Shared auth input styling across login / install / reset forms.
const inputClasses =
  'h-(--spacing-auth-input) rounded-xl border-0 bg-muted/50 px-4 text-xl md:text-xl placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary'

function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center px-2 text-muted-foreground hover:text-foreground"
      aria-label={show ? '隐藏密码' : '显示密码'}
    >
      {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
    </button>
  )
}

// ── Login form ──────────────────────────────────────────────────────────────

export interface LoginFormProps {
  action?: string
  passkeyEnabled?: boolean
  isSubmitting: boolean
  csrfToken?: string
}

export function useWebAuthnSupported(): boolean {
  // Lazy initializer runs once on mount; avoids setState-in-effect.
  const [supported] = useState(() => typeof window !== 'undefined' && 'PublicKeyCredential' in window)
  return supported
}

export function LoginForm({ action, passkeyEnabled, isSubmitting, csrfToken }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const webAuthnSupported = useWebAuthnSupported()
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const handlePasskeyLogin = async () => {
    setPasskeyError(null)
    try {
      const email = emailRef.current?.value?.trim()
      const { options } = await orpc.passkey.authBegin({ email })
      const opts = options as { challenge: string }
      const assertion = await startAuthentication({ optionsJSON: options as PublicKeyCredentialRequestOptionsJSON })
      // Submit via a hidden form so the React Router action handles session creation
      const form = formRef.current
      if (!form) {
        return
      }
      // Remove any previous passkey inputs
      form.querySelectorAll('input[name^="passkey_"]').forEach((el) => el.remove())
      const responseInput = document.createElement('input')
      responseInput.type = 'hidden'
      responseInput.name = 'passkey_response'
      responseInput.value = JSON.stringify(assertion)
      form.appendChild(responseInput)
      const challengeInput = document.createElement('input')
      challengeInput.type = 'hidden'
      challengeInput.name = 'passkey_challenge'
      challengeInput.value = opts.challenge
      form.appendChild(challengeInput)
      form.action = `${action ?? ''}?action=passkey`
      form.requestSubmit()
    } catch (err) {
      let message = 'Passkey 登录失败，请重试。'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          message = 'Passkey 验证被取消或超时。'
        } else if (err.name === 'SecurityError') {
          message = 'Passkey 验证因安全原因被拒绝。'
        }
      } else if (err instanceof Error && err.message) {
        message = err.message
      }
      setPasskeyError(message)
    }
  }

  return (
    <>
      <Form method="post" action={action} id="loginForm" ref={formRef} className="flex w-full flex-col gap-6">
        {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="loginForm-email" className="font-semibold text-(--text-admin-base)">
            邮箱
          </Label>
          <Input
            id="loginForm-email"
            ref={emailRef}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            disabled={isSubmitting}
            className={inputClasses}
          />
        </div>
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="loginForm-password" className="font-semibold text-(--text-admin-base)">
            密码
          </Label>
          <div className="relative w-full">
            <Input
              id="loginForm-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="•••••••••••••••"
              required
              minLength={10}
              disabled={isSubmitting}
              className={cn(inputClasses, 'pr-auth-input-pad')}
            />
            <div className="absolute top-3 right-2 bottom-3 flex items-center gap-1">
              <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              <Link
                to="?action=lostpassword"
                className="flex items-center border-l border-foreground/20 px-4 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                忘记？
              </Link>
            </div>
          </div>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
        >
          {isSubmitting ? (
            '登陆中...'
          ) : (
            <>
              登陆 <ArrowRightIcon className="ml-1 inline-block" size={18} />
            </>
          )}
        </Button>
      </Form>
      {passkeyEnabled && webAuthnSupported && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => {
              void handlePasskeyLogin()
            }}
            className="h-(--spacing-auth-btn) w-full rounded-xl text-xl font-normal"
          >
            <FingerprintIcon className="mr-1 inline-block" size={18} />
            使用 Passkey 登录
          </Button>
          {passkeyError && (
            <p role="alert" aria-live="polite" className="text-center text-sm text-destructive">
              {passkeyError}
            </p>
          )}
        </div>
      )}
    </>
  )
}

// ── Lost-password form ──────────────────────────────────────────────────────

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

// ── Reset-password form (covers both resetpassword and accept-invite) ───────

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
          '保存中...'
        ) : (
          <>
            设置密码 <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}

// ── OTP form ────────────────────────────────────────────────────────────────

export interface OtpFormProps {
  email: string
  sentAt: number
  isSubmitting: boolean
  csrfToken?: string
  actionData?: { message?: string; error?: string } | null
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
